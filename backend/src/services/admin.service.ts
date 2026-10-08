import { randomBytes } from 'crypto';
import {
  createAdminAccessKey,
  listAdminAccessKeys,
  listAdminUsers,
  updateAdminAccessKeyStatus,
  updateAdminUserAccess,
  updateAdminUserRole,
} from '../repositories/admin.repository';
import type {
  CreateAdminAccessKeyPayload,
  UpdateAdminAccessKeyPayload,
  UpdateAdminUserAccessPayload,
  UpdateAdminUserRolePayload,
} from '../types/admin';
import type { AccessStatus, UserRole } from '../types/auth';
import { HttpError } from '../utils/http-error';
import { hashToken } from '../utils/token';

const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 页面创建的注册码沿用脚本格式，用户看到和复制的体验保持一致。
 */
function generateAccessKey() {
  const bytes = randomBytes(16);
  let raw = '';

  for (let index = 0; index < bytes.length; index += 1) {
    raw += ACCESS_KEY_ALPHABET[bytes[index] % ACCESS_KEY_ALPHABET.length];
  }

  const segments = [];

  for (let index = 0; index < raw.length; index += 4) {
    segments.push(raw.slice(index, index + 4));
  }

  return `SLX-${segments.join('-')}`;
}

/**
 * 管理输入来自页面表单，服务层统一收口成正整数，避免 SQL interval 接到脏值。
 */
function readPositiveInteger(value: unknown, fieldName: string) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new HttpError(400, `${fieldName} 必须是大于 0 的整数`);
  }

  return numberValue;
}

/**
 * URL 参数只接受数字 id，防止无效路由参数一路传到数据库。
 */
function readId(value: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'ID 无效');
  }

  return id;
}

/**
 * 角色是授权边界，必须用枚举白名单判断。
 */
function readUserRole(role: unknown): UserRole {
  if (role === 'user' || role === 'admin') {
    return role;
  }

  throw new HttpError(400, '角色无效');
}

/**
 * 注册码状态只开放撤销和恢复未使用 key，已使用 key 不能被页面重新打开。
 */
function readAccessKeyStatus(status: unknown) {
  if (status === 'active' || status === 'revoked') {
    return status;
  }

  throw new HttpError(400, '密钥状态无效');
}

/**
 * 用户授权动作直接对应页面按钮，避免前端拼 SQL 语义。
 */
function readAccessAction(action: unknown) {
  if (action === 'suspend' || action === 'resume' || action === 'renew') {
    return action;
  }

  throw new HttpError(400, '用户操作无效');
}

export const adminService = {
  /**
   * 管理页用户列表。
   */
  async listUsers() {
    return listAdminUsers();
  },

  /**
   * 停用、恢复和续期都走同一个入口，页面按钮不需要知道表结构。
   */
  async updateUserAccess(
    currentAdminId: number,
    userIdInput: string,
    payload: UpdateAdminUserAccessPayload,
  ) {
    const userId = readId(userIdInput);
    const action = readAccessAction(payload.action);
    let status: AccessStatus = 'active';
    let accessExpiresAtSql: string | null = null;

    if (action === 'suspend') {
      if (userId === currentAdminId) {
        throw new HttpError(400, '不能停用当前登录的管理员账号');
      }

      status = 'suspended';
    }

    if (action === 'resume') {
      status = 'active';
    }

    if (action === 'renew') {
      const days = readPositiveInteger(payload.days, '续期天数');
      status = 'active';
      accessExpiresAtSql = `CASE
          WHEN access_expires_at > NOW()
            THEN access_expires_at + (${days}::text || ' days')::interval
          ELSE NOW() + (${days}::text || ' days')::interval
        END`;
    }

    const user = await updateAdminUserAccess(userId, status, accessExpiresAtSql);

    if (!user) {
      throw new HttpError(404, '用户不存在');
    }

    return user;
  },

  /**
   * 管理员可以把现有账号提权或降回普通用户。
   */
  async updateUserRole(
    currentAdminId: number,
    userIdInput: string,
    payload: UpdateAdminUserRolePayload,
  ) {
    const userId = readId(userIdInput);
    const role = readUserRole(payload.role);

    if (userId === currentAdminId && role !== 'admin') {
      throw new HttpError(400, '不能取消当前登录账号的管理员权限');
    }

    const user = await updateAdminUserRole(userId, role);

    if (!user) {
      throw new HttpError(404, '用户不存在');
    }

    return user;
  },

  /**
   * 管理页密钥列表。
   */
  async listAccessKeys() {
    return listAdminAccessKeys();
  },

  /**
   * 创建注册码时只回传一次明文，数据库仍只保存 hash。
   */
  async createAccessKey(payload: CreateAdminAccessKeyPayload) {
    const grantedDays = readPositiveInteger(payload.grantedDays, '有效天数');
    const note = (payload.note ?? '').trim().slice(0, 120);
    const accessKey = generateAccessKey();
    const created = await createAdminAccessKey(hashToken(accessKey), grantedDays, note);

    return {
      ...created,
      accessKey,
    };
  },

  /**
   * 未使用的注册码可以撤销或重新启用，已使用的 key 保持审计状态。
   */
  async updateAccessKey(accessKeyIdInput: string, payload: UpdateAdminAccessKeyPayload) {
    const accessKeyId = readId(accessKeyIdInput);
    const status = readAccessKeyStatus(payload.status);
    const accessKey = await updateAdminAccessKeyStatus(accessKeyId, status);

    if (!accessKey) {
      throw new HttpError(404, '密钥不存在或已被使用');
    }

    return accessKey;
  },
};
