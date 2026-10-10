import type { AccessStatus, UserRole } from '../types/auth';

export interface AccessStateInput {
  role: UserRole;
  accessStatus: AccessStatus;
  accessExpiresAt: string;
}

/**
 * 账号实际能不能用，由「人工状态」和「到期时间」共同决定。
 *
 * 数据库里的 access_status 只记录人工动作（停用 / 恢复 / 续期），
 * 「过期」是算出来的，没有哪一步会去写它 —— 所以判断可用性和管理页展示
 * 必须用同一个函数：否则一个早就过期的账号会在台账上一直显示「可用」，
 * 而管理员点进去才发现用户早就用不了了。
 *
 * 管理员不受到期限制：他是授权维护入口，不能因为自己的访问有效期到了
 * 就失去救援能力。停用是人工动作，对管理员一样生效。
 */
export function resolveEffectiveAccessStatus(
  user: AccessStateInput,
  now: Date = new Date(),
): AccessStatus {
  if (user.accessStatus === 'suspended') {
    return 'suspended';
  }

  if (user.role === 'admin') {
    return 'active';
  }

  if (user.accessStatus === 'expired') {
    return 'expired';
  }

  return new Date(user.accessExpiresAt).getTime() <= now.getTime() ? 'expired' : 'active';
}
