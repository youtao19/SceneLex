import type { AuthUser } from './auth'

export interface AdminUser extends AuthUser {}

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

export interface CreateAccessKeyPayload {
  grantedDays: number
  note: string
}
