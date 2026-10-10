import type { AccessStatus, UserRole } from './auth';

export interface AdminUser {
  id: number;
  email: string;
  nickname: string;
  role: UserRole;
  isVip: boolean;
  /** 库里存的人工状态（停用 / 恢复），到期不会回写这里。 */
  accessStatus: AccessStatus;
  /** 实际能不能用，由人工状态和到期时间共同算出来 —— 台账显示的是它。 */
  effectiveStatus: AccessStatus;
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

export interface UpdateAdminUserVipPayload {
  isVip?: boolean;
}

export interface UpdateAdminUserRolePayload {
  role?: UserRole;
}

export interface UpdateAdminAccessKeyPayload {
  status?: 'active' | 'revoked';
}
