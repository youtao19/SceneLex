import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './app';

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

  it('未知 API 路径返回 404，不会被 SPA fallback 吞掉', async () => {
    const response = await request(app).get('/api/definitely-not-a-route');

    expect(response.status).toBe(404);
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
