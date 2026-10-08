import { describe, expect, it } from 'vitest';
import { createSessionToken, hashToken } from './token';

describe('createSessionToken', () => {
  it('每次生成的明文 token 都不同', () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createSessionToken().token),
    );

    expect(tokens.size).toBe(50);
  });

  it('返回的摘要与 hashToken 结果一致，且不等于明文', () => {
    const { token, tokenHash } = createSessionToken();

    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toBe(token);
  });

  it('token 是 32 字节的 base64url，不含需要转义的字符', () => {
    const { token } = createSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(43);
  });
});

describe('hashToken', () => {
  it('同一个 token 摘要稳定', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('不同 token 摘要不同', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('输出 sha256 的 64 位十六进制', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
