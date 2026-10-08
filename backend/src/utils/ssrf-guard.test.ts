import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { assertSafeEndpointUrl, safeFetch, UnsafeEndpointUrlError } from './ssrf-guard';

/**
 * DNS 必须 mock：真实解析会让测试依赖网络，而且「域名解析到内网」这条
 * 正是最关键的防线，必须能确定性地构造出来。
 */
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

/**
 * 守卫固定用 `{ all: true }` 调用 lookup，但 lookup 是重载函数，
 * vi.mocked 会挑到返回单个地址的那个重载，所以这里显式声明实际用到的签名。
 */
type LookupAll = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

const lookupMock = vi.mocked(lookup as unknown as LookupAll);

/** 默认让所有域名解析到一个公网地址，单个用例再按需覆盖。 */
function resolveTo(...addresses: string[]) {
  lookupMock.mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
  );
}

afterEach(() => {
  lookupMock.mockReset();
  vi.unstubAllGlobals();
});

describe('assertSafeEndpointUrl', () => {
  it('放行解析到公网地址的 https 地址', async () => {
    resolveTo('104.18.1.1');

    await expect(assertSafeEndpointUrl('https://api.example.com/v1')).resolves.toBeInstanceOf(URL);
  });

  it.each([
    ['127.0.0.1', '回环'],
    ['0.0.0.0', '本网络'],
    ['10.1.2.3', '私有 A 段'],
    ['172.16.5.5', '私有 B 段'],
    ['192.168.1.10', '私有 C 段'],
    ['169.254.169.254', '云元数据端点'],
    ['100.64.0.1', '运营商级 NAT'],
  ])('拦掉 IPv4 字面量 %s（%s）', async (address) => {
    await expect(assertSafeEndpointUrl(`https://${address}/v1`)).rejects.toThrow(
      UnsafeEndpointUrlError,
    );
  });

  it.each([
    ['[::1]', 'IPv6 回环'],
    ['[::]', 'IPv6 未指定'],
    ['[fc00::1]', '唯一本地'],
    ['[fd12:3456::1]', '唯一本地'],
    ['[fe80::1]', '链路本地'],
    ['[::ffff:127.0.0.1]', 'IPv4-mapped 回环'],
    ['[::ffff:7f00:1]', 'IPv4-mapped 回环（十六进制写法）'],
    ['[::ffff:169.254.169.254]', 'IPv4-mapped 云元数据'],
    ['[64:ff9b::a9fe:a9fe]', 'NAT64 封装的云元数据'],
  ])('拦掉 IPv6 字面量 %s（%s）', async (host) => {
    await expect(assertSafeEndpointUrl(`https://${host}/v1`)).rejects.toThrow(
      UnsafeEndpointUrlError,
    );
  });

  /**
   * 回归测试：曾经用 addSubnet('::ffff:0:0', 96, 'ipv6') 来拦 IPv4-mapped，
   * 结果 BlockList 把每一条 IPv4 都按 IPv4-mapped 匹配，正常的公网地址全被拦了。
   */
  it('IPv4-mapped 的规则不能误伤普通公网 IPv4', async () => {
    resolveTo('104.18.1.1');

    await expect(assertSafeEndpointUrl('https://api.example.com/v1')).resolves.toBeInstanceOf(URL);
  });

  /**
   * 这条是守卫的核心价值：域名看着像公网，解析出来是内网。
   * 只做字符串匹配的实现会在这里放行。
   */
  it('域名解析到内网地址时拒绝（DNS rebinding）', async () => {
    resolveTo('127.0.0.1');

    await expect(assertSafeEndpointUrl('https://evil.example.com/v1')).rejects.toThrow(
      /解析到内网地址/,
    );
  });

  it('域名解析出多个地址时，只要有一个是内网就拒绝', async () => {
    resolveTo('104.18.1.1', '10.0.0.5');

    await expect(assertSafeEndpointUrl('https://mixed.example.com/v1')).rejects.toThrow(
      UnsafeEndpointUrlError,
    );
  });

  it('域名解析失败时拒绝，而不是放行', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(assertSafeEndpointUrl('https://nope.example.com/v1')).rejects.toThrow(
      /域名解析失败/,
    );
  });

  it('域名没有解析到任何地址时拒绝', async () => {
    resolveTo();

    await expect(assertSafeEndpointUrl('https://empty.example.com/v1')).rejects.toThrow(
      /没有解析到任何地址/,
    );
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com'])(
    '拦掉非 http(s) 协议 %s',
    async (raw) => {
      await expect(assertSafeEndpointUrl(raw)).rejects.toThrow(/只支持 http 和 https/);
    },
  );

  it('自定义端点强制 https：明文 http 会把 API Key 暴露在链路上', async () => {
    resolveTo('104.18.1.1');

    await expect(assertSafeEndpointUrl('http://api.example.com/v1')).rejects.toThrow(
      /必须使用 https/,
    );
  });

  it('地址里带账号密码时拒绝', async () => {
    resolveTo('104.18.1.1');

    await expect(assertSafeEndpointUrl('https://user:pass@api.example.com/v1')).rejects.toThrow(
      /不能包含账号密码/,
    );
  });

  it('地址格式不对时报错', async () => {
    await expect(assertSafeEndpointUrl('不是地址')).rejects.toThrow(/格式不正确/);
  });

  describe('管理员预设可信', () => {
    const trusted = ['http://localhost:11434/v1'];

    it('预设允许 http 且允许指向本机', async () => {
      await expect(
        assertSafeEndpointUrl('http://localhost:11434/v1', { trustedUrls: trusted }),
      ).resolves.toBeInstanceOf(URL);
    });

    it('尾部斜杠不影响判定', async () => {
      await expect(
        assertSafeEndpointUrl('http://localhost:11434/v1/', { trustedUrls: trusted }),
      ).resolves.toBeInstanceOf(URL);
    });

    /**
     * 可信性来自「和预设逐字比对」，所以用户不能靠伪造标记绕过。
     */
    it('用户填的相似地址不享受豁免', async () => {
      resolveTo('127.0.0.1');

      await expect(
        assertSafeEndpointUrl('https://evil.example.com/v1', { trustedUrls: trusted }),
      ).rejects.toThrow(/解析到内网地址/);
    });

    it('自定义的 http 地址即使指向内网也不豁免', async () => {
      await expect(
        assertSafeEndpointUrl('http://192.168.1.50:8000/v1', { trustedUrls: trusted }),
      ).rejects.toThrow(/必须使用 https/);
    });
  });
});

describe('safeFetch', () => {
  it('直接返回非重定向响应', async () => {
    resolveTo('104.18.1.1');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await safeFetch('https://api.example.com/v1/models');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  /**
   * 重定向后的地址也必须过校验，否则「公网地址 302 到内网」就绕过了守卫。
   */
  it('重定向到内网地址时拒绝', async () => {
    resolveTo('104.18.1.1');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(safeFetch('https://api.example.com/v1/models')).rejects.toThrow(
      UnsafeEndpointUrlError,
    );
  });

  it('重定向到另一个公网地址时继续跟随', async () => {
    resolveTo('104.18.1.1');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/v1/models' } }),
      )
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await safeFetch('https://api.example.com/v1/models');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('重定向次数超过上限时报错', async () => {
    resolveTo('104.18.1.1');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://loop.example.com/v1' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(safeFetch('https://api.example.com/v1/models')).rejects.toThrow(/重定向次数/);
  });
});
