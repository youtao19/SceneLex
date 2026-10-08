import { afterEach, describe, expect, it, vi } from 'vitest';
import { del, get, patch, post, request } from './http';

/** 后端返回什么，前端就要把 message 原样透出给用户，不能吞成通用文案。 */
function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('成功时返回解析后的 JSON', async () => {
    mockFetch(jsonResponse({ code: 0, data: { word: 'curious' } }));

    await expect(get<{ data: { word: string } }>('/words/curious')).resolves.toEqual({
      code: 0,
      data: { word: 'curious' },
    });
  });

  it('请求路径统一带上 /api 前缀，并携带同源 Cookie', async () => {
    const fetchMock = mockFetch(jsonResponse({ code: 0 }));

    await get('/words');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/words');
    expect(init.credentials).toBe('same-origin');
  });

  it('失败时抛出后端 JSON 里的 message', async () => {
    mockFetch(jsonResponse({ code: 404, message: '词库中暂未找到该单词' }, 404));

    await expect(get('/words/nope')).rejects.toThrow('词库中暂未找到该单词');
  });

  it('后端返回非 JSON 时抛出原始文本', async () => {
    mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    await expect(get('/words')).rejects.toThrow('<html>502 Bad Gateway</html>');
  });

  it('错误响应体为空时回退到通用文案', async () => {
    mockFetch(new Response('', { status: 500 }));

    await expect(get('/words')).rejects.toThrow('请求失败');
  });

  it('JSON 里没有 message 字段时回退到通用文案', async () => {
    mockFetch(jsonResponse({ code: 500 }, 500));

    await expect(get('/words')).rejects.toThrow('请求失败');
  });
});

describe('请求方法', () => {
  it('post 发送 JSON body', async () => {
    const fetchMock = mockFetch(jsonResponse({ code: 0 }));

    await post('/words', { word: 'curious' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ word: 'curious' }));
  });

  it('patch 发送 JSON body', async () => {
    const fetchMock = mockFetch(jsonResponse({ code: 0 }));

    await patch('/settings', { dailyReviewLimit: 30 });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ dailyReviewLimit: 30 }));
  });

  it('del 使用 DELETE 且不带 body', async () => {
    const fetchMock = mockFetch(jsonResponse({ code: 0 }));

    await del('/words/1');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('可以透传自定义请求头', async () => {
    const fetchMock = mockFetch(jsonResponse({ code: 0 }));

    await request('/words', { headers: { 'X-Trace-Id': 'abc' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get('X-Trace-Id')).toBe('abc');
  });
});
