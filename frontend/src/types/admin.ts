import type { AuthUser } from './auth'

export interface AdminUser extends AuthUser {
  /** 实际能不能用：由人工停用状态和到期时间共同算出来，台账显示的是它。 */
  effectiveStatus: AuthUser['accessStatus']
}

export interface AdminAccessKey {
  id: number
  status: 'active' | 'used' | 'revoked'
  grantedDays: number
  maxUses: number
  usedCount: number
  note: string
  boundUserEmail: string | null
  usedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatedAdminAccessKey extends AdminAccessKey {
  accessKey: string
}

export interface AdminUsageLimits {
  /** 0 表示不限。 */
  dailyCalls: number
  monthlyCalls: number
}

/**
 * 一个用户的模型用量。系统端点是管理员出钱的那条，所以单独计数。
 */
export interface AdminUserUsage {
  userId: number
  email: string
  nickname: string
  todayCalls: number
  todayTokens: number
  monthSystemCalls: number
  monthSystemTokens: number
}

export interface AdminUsageOverview {
  /** 统计口径是学习日（北京时间 04:00 换日），不是自然日。 */
  usageDate: string
  limits: AdminUsageLimits
  users: AdminUserUsage[]
}

export interface CreateAccessKeyPayload {
  grantedDays: number
  note: string
}
