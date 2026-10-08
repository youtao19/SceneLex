import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('同一个密码两次加盐结果不同，但都能校验通过', async () => {
    const first = await hashPassword('Correct-Horse-1');
    const second = await hashPassword('Correct-Horse-1');

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    await expect(verifyPassword('Correct-Horse-1', first.salt, first.hash)).resolves.toBe(true);
    await expect(verifyPassword('Correct-Horse-1', second.salt, second.hash)).resolves.toBe(true);
  });

  it('密码错误时返回 false', async () => {
    const { salt, hash } = await hashPassword('Correct-Horse-1');

    await expect(verifyPassword('correct-horse-1', salt, hash)).resolves.toBe(false);
  });

  it('盐被换掉后校验失败', async () => {
    const { hash } = await hashPassword('Correct-Horse-1');
    const other = await hashPassword('Correct-Horse-1');

    await expect(verifyPassword('Correct-Horse-1', other.salt, hash)).resolves.toBe(false);
  });

  it('哈希摘要长度与 scrypt 的 64 字节输出一致', async () => {
    const { salt, hash } = await hashPassword('Correct-Horse-1');

    expect(salt).toHaveLength(32);
    expect(hash).toHaveLength(128);
  });

  /**
   * 库里的 hash 被截断或改坏时，timingSafeEqual 会因为长度不同直接抛异常，
   * 所以这里必须先做长度检查再比较，否则登录会变成 500 而不是「密码错误」。
   */
  it('哈希被截断时返回 false 而不是抛异常', async () => {
    const { salt, hash } = await hashPassword('Correct-Horse-1');

    await expect(verifyPassword('Correct-Horse-1', salt, hash.slice(0, 64))).resolves.toBe(false);
  });
});
