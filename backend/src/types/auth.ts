import type { Request } from 'express';

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  accessStatus: AccessStatus;
  accessExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export type AccessStatus = 'active' | 'suspended' | 'expired';

export interface AuthUserWithPassword extends AuthUser {
  passwordSalt: string;
  passwordHash: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface RegisterPayload {
  email?: string;
  password?: string;
  inviteCode?: string;
}

export interface LoginPayload {
  email?: string;
  password?: string;
}

export interface AccessKeyGrant {
  id: number;
  grantedDays: number;
  maxUses: number;
  usedCount: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  authToken?: string;
}
