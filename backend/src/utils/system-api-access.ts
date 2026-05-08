import type { AuthUser } from '../types/auth'

/**
 * 系统 API Key 是共享成本入口，只允许管理员和管理员授予的 VIP 使用。
 */
export function canUseSystemApi(user: AuthUser) {
  return user.role === 'admin' || user.isVip
}
