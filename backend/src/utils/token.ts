import { createHash, randomBytes } from 'crypto';

/**
 * 原始 token 只返回给客户端，数据库里只存摘要，避免库表泄露后直接接管会话。
 */
export function createSessionToken() {
  const token = randomBytes(32).toString('base64url');

  return {
    token,
    tokenHash: hashToken(token),
  };
}

/**
 * 会话查询统一走摘要，仓储层就不需要碰明文 token。
 */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
