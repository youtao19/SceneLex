export const AUTH_STORAGE_KEY = 'sl-auth-session'

export interface AuthUser {
  id: number
  email: string
  nickname: string
  avatarUrl?: string | null
  role: 'user' | 'admin'
  isVip: boolean
  accessStatus: 'active' | 'suspended' | 'expired'
  accessExpiresAt: string
  createdAt: string
  updatedAt: string
}

export interface AuthSession {
  token: string
  user: AuthUser
}

export interface AuthState {
  token: string
  user: AuthUser | null
}

export interface RegisterPayload {
  email: string
  password: string
  inviteCode: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface UpdateProfilePayload {
  nickname: string
}
