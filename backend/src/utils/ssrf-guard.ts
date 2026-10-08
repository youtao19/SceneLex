import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * 出站地址校验。
 *
 * 为什么需要它：端点的 baseURL 由用户填写，而后端会替用户去请求这个地址。
 * 这台服务器上跑着 PostgreSQL（127.0.0.1:5432），云厂商的元数据端点
 * （169.254.169.254）还能换到实例凭证 —— 不校验就等于把内网开放给任何登录用户。
 *
 * 关键点：必须解析 DNS 之后校验「解析出来的 IP」，只检查字符串是不够的，
 * 因为 evil.com 完全可以解析到 127.0.0.1（DNS rebinding）。
 */

/**
 * 这些网段一律不允许访问。用 net.BlockList 而不是手写前缀比较，
 * 是因为 IPv6 的展开规则（::ffff:、::1、fc00::/7）手写很容易漏。
 */
const blockedAddresses = new BlockList();

// IPv4
blockedAddresses.addSubnet('0.0.0.0', 8, 'ipv4'); // 本网络
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4'); // 私有
blockedAddresses.addSubnet('100.64.0.0', 10, 'ipv4'); // 运营商级 NAT
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4'); // 回环
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4'); // 链路本地，含云元数据
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4'); // 私有
blockedAddresses.addSubnet('192.0.0.0', 24, 'ipv4'); // IETF 协议分配
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4'); // 私有
blockedAddresses.addSubnet('198.18.0.0', 15, 'ipv4'); // 基准测试
blockedAddresses.addSubnet('224.0.0.0', 4, 'ipv4'); // 组播
blockedAddresses.addSubnet('240.0.0.0', 4, 'ipv4'); // 保留

// IPv6
blockedAddresses.addAddress('::', 'ipv6'); // 未指定
blockedAddresses.addAddress('::1', 'ipv6'); // 回环
blockedAddresses.addSubnet('fc00::', 7, 'ipv6'); // 唯一本地
blockedAddresses.addSubnet('fe80::', 10, 'ipv6'); // 链路本地
blockedAddresses.addSubnet('ff00::', 8, 'ipv6'); // 组播

/**
 * 拆出内嵌在 IPv6 里的 IPv4。
 *
 * 这里不能用 `addSubnet('::ffff:0:0', 96, 'ipv6')`：BlockList 在检查 IPv4 时
 * 会把它当成 IPv4-mapped IPv6 去匹配 ipv6 规则，结果每一条 IPv4（包括正常的公网地址）
 * 都会被拦下来。所以只能显式拆出内嵌地址再按 IPv4 规则判断。
 */
function unwrapEmbeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();

  // ::ffff:127.0.0.1
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);

  if (dotted) {
    return dotted[1];
  }

  // ::ffff:7f00:1 和 NAT64 的 64:ff9b::7f00:1，后两组是十六进制形式的 IPv4
  const hex = /^(?:::ffff|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);

  if (hex) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);

    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }

  // 其他 ::ffff: 写法认不出来，宁可拒绝。
  return lower.startsWith('::ffff:') ? '0.0.0.0' : null;
}

function isBlockedAddress(address: string) {
  const version = isIP(address);

  if (version === 4) {
    return blockedAddresses.check(address, 'ipv4');
  }

  if (version === 6) {
    const embedded = unwrapEmbeddedIpv4(address);

    return embedded
      ? blockedAddresses.check(embedded, 'ipv4')
      : blockedAddresses.check(address, 'ipv6');
  }

  // 既不是 IPv4 也不是 IPv6，说明调用方传错了，保守起见当作不安全。
  return true;
}

export class UnsafeEndpointUrlError extends Error {}

/**
 * 管理员维护的预设指向本机（Ollama 默认 http://localhost:11434）是合理的，
 * 所以可信性必须由「和预设列表逐字比对」得出，而不是由用户提交的某个标记位决定 ——
 * 否则用户自己标个 trusted 就绕过了全部校验。
 */
function isTrustedEndpointUrl(rawUrl: string, trustedUrls: string[]) {
  const normalized = normalizeUrlForCompare(rawUrl);

  return trustedUrls.some((item) => normalizeUrlForCompare(item) === normalized);
}

function normalizeUrlForCompare(value: string) {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * URL.hostname 对 IPv6 会保留方括号（如 "[::1]"），isIP 认不出来，
 * 不去掉就会误进 DNS 分支。
 */
function readHostname(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, '');
}

/**
 * 解析主机名并逐个校验结果。任何一条解析结果落在禁用网段就整体拒绝，
 * 因为攻击者只要让域名解析出一个内网地址就够了。
 */
async function assertHostResolvesToPublicAddress(hostname: string) {
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new UnsafeEndpointUrlError(`该地址不允许访问：${hostname}`);
    }

    return;
  }

  let resolved: Array<{ address: string }>;

  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeEndpointUrlError(`域名解析失败：${hostname}`);
  }

  if (resolved.length === 0) {
    throw new UnsafeEndpointUrlError(`域名没有解析到任何地址：${hostname}`);
  }

  for (const item of resolved) {
    if (isBlockedAddress(item.address)) {
      throw new UnsafeEndpointUrlError(
        `${hostname} 解析到内网地址 ${item.address}，不允许访问`,
      );
    }
  }
}

export interface GuardEndpointOptions {
  /** 管理员维护的预设地址，允许指向内网、允许 http。 */
  trustedUrls?: string[];
}

/**
 * 校验一个用户填写的端点地址，通过则返回解析好的 URL。
 *
 * 非可信地址强制 https：API Key 会随请求发出，明文 http 等于把密钥交给链路。
 */
export async function assertSafeEndpointUrl(
  rawUrl: string,
  options: GuardEndpointOptions = {},
): Promise<URL> {
  const trustedUrls = options.trustedUrls ?? [];
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeEndpointUrlError('地址格式不正确');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeEndpointUrlError(`只支持 http 和 https，当前是 ${url.protocol}`);
  }

  if (isTrustedEndpointUrl(rawUrl, trustedUrls)) {
    return url;
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeEndpointUrlError('自定义端点必须使用 https');
  }

  // 带账号密码的地址对模型端点没有意义，反而可能在日志里泄露凭据。
  if (url.username || url.password) {
    throw new UnsafeEndpointUrlError('地址里不能包含账号密码');
  }

  await assertHostResolvesToPublicAddress(readHostname(url));

  return url;
}

const MAX_REDIRECTS = 3;

/**
 * 带校验的出站请求。
 *
 * 重定向必须手动处理：fetch 默认会自动跟随，而跟随之后的地址没经过校验，
 * 攻击者用一个公网地址跳转到 169.254.169.254 就绕过了前面的检查。
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  options: GuardEndpointOptions = {},
): Promise<Response> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertSafeEndpointUrl(currentUrl, options);
    const response = await fetch(url, { ...init, redirect: 'manual' });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('location');

    if (!location) {
      return response;
    }

    currentUrl = new URL(location, url).toString();
  }

  throw new UnsafeEndpointUrlError(`重定向次数超过 ${MAX_REDIRECTS} 次`);
}
