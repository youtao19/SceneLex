import { withTransaction } from '../config/database';
import {
  consumeAccessKey,
  findAccessKeyForUpdate,
} from '../repositories/access-key.repository';
import {
  createSession,
  createUser,
  deleteSessionByTokenHash,
  findUserByEmail,
  findUserByTokenHash,
  touchSession,
} from '../repositories/auth.repository';
import type {
  AccessStatus,
  AuthSession,
  AuthUser,
  LoginPayload,
  RegisterPayload,
} from '../types/auth';
import { HttpError } from '../utils/http-error';
import { hashPassword, verifyPassword } from '../utils/password';
import { createSessionToken, hashToken } from '../utils/token';

const SESSION_TTL_DAYS = 30;

/**
 * 邮箱作为唯一登录键，统一小写和裁剪空白，避免同一邮箱注册出多个账号。
 */
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * 昵称先从邮箱前缀推导，先把注册链路跑通，后续再单独开放用户资料编辑。
 */
function buildNickname(email: string) {
  const source = email.split('@')[0]?.trim() || 'SceneLex';
  return source.slice(0, 24);
}

/**
 * 认证错误信息尽量收敛，避免把账号存在与否暴露给撞库脚本。
 */
function throwInvalidCredentials(): never {
  throw new HttpError(401, '邮箱或密码错误');
}

/**
 * 登录注册只依赖最基本口令规则，先保证链路可靠，再把复杂策略留给设置页。
 */
function validatePassword(password: string) {
  if (password.length < 8) {
    throw new HttpError(400, '密码至少需要 8 位');
  }
}

/**
 * 注册码和邮箱一样都要做标准化，否则用户复制时带的空白会造成误判。
 */
function normalizeInviteCode(inviteCode: string) {
  return inviteCode.trim().toUpperCase();
}

/**
 * days 型注册码在注册成功时才真正开始计时，这样提前生成也不会白白消耗可用期。
 */
function getAccessExpiresAt(days: number) {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return expiresAt.toISOString();
}

/**
 * 账号可用性需要统一判断，避免登录和接口放行逻辑出现分叉。
 */
function getAccessIssue(user: AuthUser) {
  if (user.accessStatus === 'suspended') {
    return {
      status: 'suspended' as const,
      message: '账号已被停用，请联系管理员',
    };
  }

  if (user.accessStatus === 'expired') {
    return {
      status: 'expired' as const,
      message: '账号已过期，请联系管理员续期',
    };
  }

  if (new Date(user.accessExpiresAt).getTime() <= Date.now()) {
    return {
      status: 'expired' as const,
      message: '账号已过期，请联系管理员续期',
    };
  }

  return null;
}

/**
 * 受保护资源和登录入口都走同一套授权判断，确保被停用用户不会从别的入口绕过去。
 */
export function assertUserHasAccess(user: AuthUser) {
  const issue = getAccessIssue(user);

  if (!issue) {
    return;
  }

  user.accessStatus = issue.status as AccessStatus;
  throw new HttpError(403, issue.message);
}

/**
 * 会话过期时间固定生成，避免不同入口各自算时间导致策略漂移。
 */
function getSessionExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt.toISOString();
}

export const authService = {
  /**
   * 注册成功后直接签发会话，用户不需要再手动走一次登录流程。
   */
  async register(payload: RegisterPayload): Promise<AuthSession> {
    const email = normalizeEmail(payload.email ?? '');
    const password = payload.password?.trim() ?? '';
    const inviteCode = normalizeInviteCode(payload.inviteCode ?? '');

    if (!email) {
      throw new HttpError(400, '邮箱不能为空');
    }

    if (!email.includes('@')) {
      throw new HttpError(400, '请输入合法的邮箱地址');
    }

    validatePassword(password);

    if (!inviteCode) {
      throw new HttpError(400, '访问密钥不能为空');
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      throw new HttpError(409, '该邮箱已注册');
    }

    const passwordInfo = await hashPassword(password);
    const sessionInfo = createSessionToken();
    const expiresAt = getSessionExpiresAt();

    const user = await withTransaction(async (client) => {
      const accessKey = await findAccessKeyForUpdate(client, hashToken(inviteCode));

      if (!accessKey) {
        throw new HttpError(400, '访问密钥无效或已被使用');
      }

      if (accessKey.usedCount >= accessKey.maxUses) {
        throw new HttpError(400, '访问密钥已被使用');
      }

      const createdUser = await createUser(
        client,
        email,
        buildNickname(email),
        passwordInfo.salt,
        passwordInfo.hash,
        getAccessExpiresAt(accessKey.grantedDays),
      );

      await consumeAccessKey(client, accessKey.id, createdUser.id);
      await createSession(client, createdUser.id, sessionInfo.tokenHash, expiresAt);

      return createdUser;
    });

    return {
      token: sessionInfo.token,
      user,
    };
  },

  /**
   * 登录只返回当前用户与新会话，避免前端继续拼装不可信的用户信息。
   */
  async login(payload: LoginPayload): Promise<AuthSession> {
    const email = normalizeEmail(payload.email ?? '');
    const password = payload.password?.trim() ?? '';

    if (!email || !password) {
      throwInvalidCredentials();
    }

    const user = await findUserByEmail(email);

    if (!user) {
      throwInvalidCredentials();
    }

    const matched = await verifyPassword(password, user.passwordSalt, user.passwordHash);

    if (!matched) {
      throwInvalidCredentials();
    }

    assertUserHasAccess(user);

    const sessionInfo = createSessionToken();
    const expiresAt = getSessionExpiresAt();

    await withTransaction(async (client) => {
      await createSession(client, user.id, sessionInfo.tokenHash, expiresAt);
    });

    return {
      token: sessionInfo.token,
      user,
    };
  },

  /**
   * Bearer token 只在服务层解析，控制器和中间件都只依赖业务语义。
   */
  async getUserByToken(token: string): Promise<AuthUser> {
    if (!token) {
      throw new HttpError(401, '请先登录');
    }

    const tokenHash = hashToken(token);
    const user = await findUserByTokenHash(tokenHash);

    if (!user) {
      throw new HttpError(401, '登录已失效，请重新登录');
    }

    await touchSession(tokenHash);

    return user;
  },

  /**
   * 退出只移除当前 token 对应的会话，这样不会误伤其他已登录设备。
   */
  async logout(token: string) {
    if (!token) {
      return;
    }

    await deleteSessionByTokenHash(hashToken(token));
  },
};
