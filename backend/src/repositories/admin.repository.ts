import { query } from '../config/database';
import type { AccessStatus, UserRole } from '../types/auth';
import type { AdminAccessKey, AdminUser } from '../types/admin';

interface AdminUserRow {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  access_status: AccessStatus;
  access_expires_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

interface AdminAccessKeyRow {
  id: string;
  status: 'active' | 'used' | 'revoked';
  granted_days: number;
  max_uses: number;
  used_count: number;
  note: string;
  bound_user_email: string | null;
  used_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/**
 * 管理页只展示授权需要的信息，避免把密码摘要等敏感字段带到前端。
 */
function mapAdminUserRow(row: AdminUserRow): AdminUser {
  return {
    id: Number(row.id),
    email: row.email,
    nickname: row.nickname,
    role: row.role,
    accessStatus: row.access_status,
    accessExpiresAt: new Date(row.access_expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * 注册码明文无法从 hash 还原，列表里只展示审计和状态字段。
 */
function mapAccessKeyRow(row: AdminAccessKeyRow): AdminAccessKey {
  return {
    id: Number(row.id),
    status: row.status,
    grantedDays: Number(row.granted_days),
    maxUses: Number(row.max_uses),
    usedCount: Number(row.used_count),
    note: row.note,
    boundUserEmail: row.bound_user_email,
    usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * 管理员通常按最近创建的账号处理，排序固定能让页面刷新后不跳位。
 */
export async function listAdminUsers() {
  const result = await query<AdminUserRow>(
    `
      SELECT
        id,
        email,
        nickname,
        role,
        access_status,
        access_expires_at,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC, id DESC
    `,
  );

  return result.rows.map(mapAdminUserRow);
}

/**
 * 账号状态变更统一返回最新用户行，前端不用再做局部猜测。
 */
export async function updateAdminUserAccess(
  userId: number,
  accessStatus: AccessStatus,
  accessExpiresAtSql: string | null,
) {
  const params: Array<number | string> = [userId, accessStatus];
  const expiresUpdate = accessExpiresAtSql
    ? `access_expires_at = ${accessExpiresAtSql},`
    : '';

  const result = await query<AdminUserRow>(
    `
      UPDATE users
      SET
        access_status = $2,
        ${expiresUpdate}
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        email,
        nickname,
        role,
        access_status,
        access_expires_at,
        created_at,
        updated_at
    `,
    params,
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapAdminUserRow(result.rows[0]);
}

/**
 * 角色只接受服务层校验后的枚举值，避免页面传入任意字符串污染授权逻辑。
 */
export async function updateAdminUserRole(userId: number, role: UserRole) {
  const result = await query<AdminUserRow>(
    `
      UPDATE users
      SET
        role = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        email,
        nickname,
        role,
        access_status,
        access_expires_at,
        created_at,
        updated_at
    `,
    [userId, role],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapAdminUserRow(result.rows[0]);
}

/**
 * 注册码列表优先显示可用 key，管理员创建后能立刻在顶部看到。
 */
export async function listAdminAccessKeys() {
  const result = await query<AdminAccessKeyRow>(
    `
      SELECT
        ak.id,
        ak.status,
        ak.granted_days,
        ak.max_uses,
        ak.used_count,
        ak.note,
        u.email AS bound_user_email,
        ak.used_at,
        ak.created_at,
        ak.updated_at
      FROM access_keys ak
      LEFT JOIN users u
        ON u.id = ak.bound_user_id
      ORDER BY
        CASE ak.status
          WHEN 'active' THEN 0
          WHEN 'used' THEN 1
          ELSE 2
        END,
        ak.created_at DESC,
        ak.id DESC
    `,
  );

  return result.rows.map(mapAccessKeyRow);
}

/**
 * 页面创建注册码和脚本创建注册码共用同一张表，只是这里会把明文 key 回传一次。
 */
export async function createAdminAccessKey(
  keyHash: string,
  grantedDays: number,
  note: string,
) {
  const result = await query<AdminAccessKeyRow>(
    `
      INSERT INTO access_keys (
        key_hash,
        status,
        granted_days,
        max_uses,
        used_count,
        note
      )
      VALUES ($1, 'active', $2, 1, 0, $3)
      RETURNING
        id,
        status,
        granted_days,
        max_uses,
        used_count,
        note,
        NULL::text AS bound_user_email,
        used_at,
        created_at,
        updated_at
    `,
    [keyHash, grantedDays, note],
  );

  return mapAccessKeyRow(result.rows[0]);
}

/**
 * 已消费的 key 不允许重新激活，否则会破坏“一人一码”的审计语义。
 */
export async function updateAdminAccessKeyStatus(
  accessKeyId: number,
  status: 'active' | 'revoked',
) {
  const result = await query<AdminAccessKeyRow>(
    `
      UPDATE access_keys
      SET
        status = $2,
        updated_at = NOW()
      WHERE id = $1
        AND used_count = 0
      RETURNING
        id,
        status,
        granted_days,
        max_uses,
        used_count,
        note,
        NULL::text AS bound_user_email,
        used_at,
        created_at,
        updated_at
    `,
    [accessKeyId, status],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapAccessKeyRow(result.rows[0]);
}
