import { withTransaction } from '../config/database';
import { deleteAvatarFileQuietly } from './avatar-storage.service';
import {
  consumeAccessKey,
  findAccessKeyForUpdate,
} from '../repositories/access-key.repository';
import {
  countAdmins,
  createSession,
  createUser,
  deleteOtherSessions,
  deleteSessionByTokenHash,
  deleteUserById,
  findPasswordHashById,
  findUserByEmail,
  findUserByTokenHash,
  touchSession,
  updateUserAvatar,
  updateUserPassword,
  updateUserProfile,
} from '../repositories/auth.repository';
import type {
  AccessStatus,
  AuthSession,
  AuthUser,
  ChangePasswordPayload,
  DeleteAccountPayload,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
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
 * 改密码的规则单独抽出来，是因为它全是纯判断：不连库就能测，改规则时
 * 测试直接说明"什么算合规的新密码"，而不是绕一大圈去断言数据库状态。
 *
 * 调用时机在"验过旧密码之后"，这样旧密码打错时报的是"当前密码不正确"，
 * 而不是被新密码的格式问题抢先报出来。
 */
export function assertNewPasswordIsUsable(currentPassword: string, newPassword: string) {
  validatePassword(newPassword);

  if (currentPassword === newPassword) {
    throw new HttpError(400, '新密码不能与当前密码相同');
  }
}

/**
 * 昵称会直接展示在顶栏和资料页，长度收敛能避免小屏布局被撑坏。
 */
function normalizeNickname(nickname: string) {
  return nickname.trim().replace(/\s+/g, ' ');
}

function validateNickname(nickname: string) {
  if (!nickname) {
    throw new HttpError(400, '昵称不能为空');
  }

  if (nickname.length > 24) {
    throw new HttpError(400, '昵称最多 24 个字符');
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

  // 管理员是授权维护入口，不能因为普通访问有效期到期而失去救援能力。
  if (user.role === 'admin') {
    return null;
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
   * 资料更新只接受当前登录用户自己的 userId，避免前端传入目标用户造成越权。
   */
  async updateProfile(userId: number, payload: UpdateProfilePayload): Promise<AuthUser> {
    const nickname = normalizeNickname(payload.nickname ?? '');
    validateNickname(nickname);

    const user = await updateUserProfile(userId, nickname);

    if (!user) {
      throw new HttpError(404, '用户不存在');
    }

    return user;
  },

  /**
   * 更新用户头像。
   */
  async updateAvatar(userId: number, avatarUrl: string): Promise<AuthUser> {
    const user = await updateUserAvatar(userId, avatarUrl);

    if (!user) {
      throw new HttpError(404, '用户不存在');
    }

    return user;
  },

  /**
   * 改密码要验旧口令，否则会话被偷走后可以直接改密把真正的用户锁在外面。
   */
  async changePassword(
    userId: number,
    token: string,
    payload: ChangePasswordPayload,
  ) {
    const currentPassword = payload.currentPassword?.trim() ?? '';
    const newPassword = payload.newPassword?.trim() ?? '';

    if (!currentPassword) {
      throw new HttpError(400, '请输入当前密码');
    }

    if (!newPassword) {
      throw new HttpError(400, '请输入新密码');
    }

    const credentials = await findPasswordHashById(userId);

    if (!credentials) {
      throw new HttpError(404, '用户不存在');
    }

    const matched = await verifyPassword(
      currentPassword,
      credentials.passwordSalt,
      credentials.passwordHash,
    );

    if (!matched) {
      throw new HttpError(401, '当前密码不正确');
    }

    assertNewPasswordIsUsable(currentPassword, newPassword);

    const passwordInfo = await hashPassword(newPassword);

    await updateUserPassword(userId, passwordInfo.salt, passwordInfo.hash);
    // 改密码的常见动机是"怀疑别人知道我的密码"，所以其他设备的会话必须失效。
    // 保留当前这条：用户刚证明过自己知道新密码，把他自己也踢下线只会让人以为改失败了。
    await deleteOtherSessions(userId, hashToken(token));
  },

  /**
   * 注销账号不可撤销，所以要求重新输入密码，而不是仅凭会话。
   */
  async deleteAccount(user: AuthUser, payload: DeleteAccountPayload) {
    const password = payload.password?.trim() ?? '';

    if (!password) {
      throw new HttpError(400, '请输入密码以确认注销');
    }

    // 先查管理员数量再验密码：注销是本人主动发起的，早一步给出"你是最后一个管理员"
    // 比让他输完密码才被拒更好懂。这一步不泄露任何别人的信息。
    if (user.role === 'admin') {
      const admins = await countAdmins();

      if (admins <= 1) {
        throw new HttpError(
          400,
          '这是最后一个管理员账号，注销后将没有人能再进入管理页。请先设置另一个管理员。',
        );
      }
    }

    const credentials = await findPasswordHashById(user.id);

    if (!credentials) {
      throw new HttpError(404, '用户不存在');
    }

    const matched = await verifyPassword(
      password,
      credentials.passwordSalt,
      credentials.passwordHash,
    );

    if (!matched) {
      throw new HttpError(401, '密码不正确');
    }

    await deleteUserById(user.id);

    // 数据已经删了，这时文件删不掉也不该让请求失败——报错只会让用户以为没注销成功，
    // 然后反复重试。留个日志，剩下的交给运维清理。
    await deleteAvatarFileQuietly(user.avatarUrl);

    return { email: user.email };
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
