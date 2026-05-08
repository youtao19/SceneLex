import type { AccessStatus, UserRole } from './auth';

export interface AdminUser {
  id: number;
  email: string;
  nickname: string;
  role: UserRole;
  isVip: boolean;
  accessStatus: AccessStatus;
  accessExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAccessKey {
  id: number;
  status: 'active' | 'used' | 'revoked';
  grantedDays: number;
  maxUses: number;
  usedCount: number;
  note: string;
  boundUserEmail: string | null;
  usedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminAccessKeyPayload {
  grantedDays?: number;
  note?: string;
}

export interface CreatedAdminAccessKey extends AdminAccessKey {
  accessKey: string;
}

export interface UpdateAdminUserAccessPayload {
  action?: 'suspend' | 'resume' | 'renew';
  days?: number;
}

export interface UpdateAdminUserRolePayload {
  role?: UserRole;
}

export interface UpdateAdminUserVipPayload {
  isVip?: boolean;
}

export interface UpdateAdminAccessKeyPayload {
  status?: 'active' | 'revoked';
}
