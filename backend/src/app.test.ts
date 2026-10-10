import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Response } from 'express';
import compression from 'compression';
import path from 'path';
import app, { setStaticCacheHeaders, shouldCompress } from './app';

/**
 * 这一层只覆盖「不需要数据库」的契约：健康检查、未登录拦截、跨域白名单。
 * 需要真实数据的用例留给后续的集成测试，避免单元测试依赖本地 PostgreSQL。
 */
describe('GET /health', () => {
  it('返回约定的存活契约', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'backend is running' });
  });
});

describe('受保护路由', () => {
  it.each([
    '/api/words',
    '/api/history',
    '/api/word-books',
    '/api/settings',
    '/api/admin',
    '/api/word/overview',
    '/api/word/new',
  ])('%s 没有会话时返回 401', async (path) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 401, message: '请先登录', data: null });
  });

  it('完成新词没有会话时返回 401', async () => {
    const response = await request(app)
      .post('/api/word/complete-new')
      .send({ word: 'curious', rating: 'good' });

    expect(response.status).toBe(401);
  });

  it.each([
    ['post', '/api/ocr/batches'],
    ['get', '/api/ocr/batches/1'],
    ['delete', '/api/ocr/batches/1'],
    ['post', '/api/ocr/batches/1/pages/0'],
    ['post', '/api/ocr/batches/1/pages/0/retry'],
    ['post', '/api/ocr/batches/1/pages/0/skip'],
    ['post', '/api/ocr/batches/1/article'],
  ] as const)('%s %s 没有会话时返回 401', async (method, path) => {
    const response = await request(app)[method](path);

    expect(response.status).toBe(401);
  });

  it('未知 API 路径返回 404，不会被 SPA fallback 吞掉', async () => {
    const response = await request(app).get('/api/definitely-not-a-route');

    expect(response.status).toBe(404);
  });
});

describe('请求日志', () => {
  /**
   * loggerMiddleware 曾经只被定义、从未在 app.ts 里注册，等于线上一条请求日志都没有。
   * 这条用例盯的就是"有没有真的接上"，光看中间件自身是发现不了的。
   */
  it('每个请求都会记录状态码和耗时', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    try {
      await request(app).get('/health');
      // finish 事件在响应交给内核之后才触发，等一拍再断言，否则会偶发读不到。
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      spy.mockRestore();
    }

    expect(lines.some((line) => /\[GET\] \/health 200 [\d.]+ms/.test(line))).toBe(true);
  });
});

describe('响应压缩', () => {
  /**
   * 静态资源只在 frontend/dist 存在时才挂载，而 CI 里 test 跑在 build 之前，
   * 所以这里用同一个 filter 搭一个最小应用 —— 验证的是真实中间件行为，不是 mock。
   */
  const probeApp = express();

  probeApp.use(compression({ filter: shouldCompress }));

  probeApp.get('/json', (_req, res) => {
    res.json({ payload: 'x'.repeat(2048) });
  });

  probeApp.get('/stream', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    /**
     * 故意不设 no-transform：真实的助手接口带了它，compression 默认就会跳过，
     * 那样测到的是那个头而不是这里的过滤器。去掉它，这条用例才真的在验证过滤器本身。
     */
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    // 载荷要越过 compression 的 1KB 阈值，否则过滤失效时也压不上，这条用例就抓不到回归。
    res.write(`data: ${'x'.repeat(2048)}\n\n`);
    res.end();
  });

  it('普通 JSON 响应会被压缩', async () => {
    const response = await request(probeApp)
      .get('/json')
      .set('Accept-Encoding', 'gzip');

    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('SSE 不压缩，否则助手回复会被攒在缓冲区里不再逐段出现', async () => {
    const response = await request(probeApp)
      .get('/stream')
      .set('Accept-Encoding', 'gzip');

    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.text).toContain('data:');
  });
});

describe('静态资源缓存头', () => {
  function captureHeaders(filePath: string) {
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as Response;

    setStaticCacheHeaders(res, filePath);

    return headers;
  }

  it('文件名带哈希的 assets 可以长期缓存', () => {
    const headers = captureHeaders(
      path.join('/app', 'frontend', 'dist', 'assets', 'index-Cu1T6l2G.js'),
    );

    expect(headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });

  it('文件名没有哈希的静态文件每次回源校验', () => {
    const headers = captureHeaders(
      path.join('/app', 'frontend', 'dist', 'favicon.ico'),
    );

    expect(headers['Cache-Control']).toBe('no-cache');
  });
});

describe('跨域白名单', () => {
  // /health 不走 apiCors，所以这里必须用 /api 下的路径才能验证白名单生效。
  it('开发端口默认放行', async () => {
    const response = await request(app)
      .get('/api/words')
      .set('Origin', 'http://localhost:9003');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:9003');
    expect(response.status).toBe(401);
  });

  it('未配置的域名不返回放行头', async () => {
    const response = await request(app)
      .get('/api/words')
      .set('Origin', 'https://evil.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
