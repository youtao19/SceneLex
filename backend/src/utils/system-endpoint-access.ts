import type { AuthUser } from '../types/auth'

/**
 * 系统端点是管理员出钱配置的共享算力，所以只放给管理员和他手动开通的人。
 * 这也是 VIP 现在唯一的含义：能不能用系统端点。
 */
export function canUseSystemEndpoint(user: AuthUser) {
  return user.role === 'admin' || user.isVip
}
