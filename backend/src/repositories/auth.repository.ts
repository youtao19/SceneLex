import type { PoolClient } from 'pg';
import { query } from '../config/database';
import type { AuthUser, AuthUserWithPassword } from '../types/auth';

interface UserRow {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  access_status: 'active' | 'suspended' | 'expired';
  access_expires_at: string | Date;
  password_salt: string;
  password_hash: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface SessionUserRow extends UserRow {
  expires_at: string | Date;
}

/**
 * 数据库字段是 snake_case，这里集中转一次，避免业务层反复关心命名差异。
 */
function mapUserRow(row: UserRow): AuthUser {
  return {
    id: Number(row.id),
    email: row.email,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    accessStatus: row.access_status,
    accessExpiresAt: new Date(row.access_expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * 注册和登录都需要密码字段，这里单独保留一份映射，避免把敏感字段透给控制器。
 */
function mapUserWithPassword(row: UserRow): AuthUserWithPassword {
  return {
    ...mapUserRow(row),
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
  };
}

/**
 * 邮箱查重和登录都依赖同一查询，集中后能保证返回字段一致。
 */
export async function findUserByEmail(email: string) {
  const result = await query<UserRow>(
    `
      SELECT
        id,
        email,
        nickname,
        avatar_url,
        access_status,
        access_expires_at,
        password_salt,
        password_hash,
        created_at,
        updated_at
      FROM users
      WHERE email = $1
    `,
    [email],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserWithPassword(result.rows[0]);
}

/**
 * 注册流程需要和 session 创建放在同一事务里，避免半成功状态。
 */
export async function createUser(
  client: PoolClient,
  email: string,
  nickname: string,
  passwordSalt: string,
  passwordHash: string,
  accessExpiresAt: string,
) {
  const result = await client.query<UserRow>(
    `
      INSERT INTO users (
        email,
        nickname,
        access_status,
        access_expires_at,
        password_salt,
        password_hash
      )
      VALUES ($1, $2, 'active', $3::timestamptz, $4, $5)
      RETURNING
        id,
        email,
        nickname,
        avatar_url,
        access_status,
        access_expires_at,
        password_salt,
        password_hash,
        created_at,
        updated_at
    `,
    [email, nickname, accessExpiresAt, passwordSalt, passwordHash],
  );

  return mapUserRow(result.rows[0]);
}

/**
 * 会话和用户解耦存储，后续如果要支持多端登录或踢人下线时不会推翻表结构。
 */
export async function createSession(
  client: PoolClient,
  userId: number,
  tokenHash: string,
  expiresAt: string,
) {
  await client.query(
    `
      INSERT INTO user_sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3::timestamptz)
    `,
    [userId, tokenHash, expiresAt],
  );
}

/**
 * 中间件只需要拿到当前有效用户，过期会话直接视为未登录。
 */
export async function findUserByTokenHash(tokenHash: string) {
  const result = await query<SessionUserRow>(
    `
      SELECT
        u.id,
        u.email,
        u.nickname,
        u.avatar_url,
        u.access_status,
        u.access_expires_at,
        u.password_salt,
        u.password_hash,
        u.created_at,
        u.updated_at,
        s.expires_at
      FROM user_sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
    `,
    [tokenHash],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(result.rows[0]);
}

/**
 * 活跃时间单独更新，后面如果要做设备列表和最近登录展示会直接复用。
 */
export async function touchSession(tokenHash: string) {
  await query(
    `
      UPDATE user_sessions
      SET last_used_at = NOW()
      WHERE token_hash = $1
    `,
    [tokenHash],
  );
}

/**
 * 个人资料先只开放昵称编辑，避免邮箱变更影响登录唯一键和通知链路。
 */
export async function updateUserProfile(userId: number, nickname: string) {
  const result = await query<UserRow>(
    `
      UPDATE users
      SET
        nickname = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        email,
        nickname,
        avatar_url,
        access_status,
        access_expires_at,
        password_salt,
        password_hash,
        created_at,
        updated_at
    `,
    [userId, nickname],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(result.rows[0]);
}

/**
 * 更新用户头像。
 */
export async function updateUserAvatar(userId: number, avatarUrl: string) {
  const result = await query<UserRow>(
    `
      UPDATE users
      SET
        avatar_url = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        email,
        nickname,
        avatar_url,
        access_status,
        access_expires_at,
        password_salt,
        password_hash,
        created_at,
        updated_at
    `,
    [userId, avatarUrl],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapUserRow(result.rows[0]);
}

/**
 * 退出登录只需要删当前会话，不影响同账号的其他设备。
 */
export async function deleteSessionByTokenHash(tokenHash: string) {
  await query(
    `
      DELETE FROM user_sessions
      WHERE token_hash = $1
    `,
    [tokenHash],
  );
}
