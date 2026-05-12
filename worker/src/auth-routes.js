// ── Helpers ──────────────────────────────────────────────────────────

function json(data, init) {
  return Response.json(data, init);
}

function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function errorJson(statusCode, message) {
  return json({ code: statusCode, message, data: null }, { status: statusCode });
}

async function readJsonBody(request) {
  try { return await request.json(); } catch { return {}; }
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const SCryptN = 16384;
const SCryptR = 8;
const SCryptP = 1;
const SCryptDkLen = 64;
const SESSION_TTL_DAYS = 30;

// ── Crypto ───────────────────────────────────────────────────────────

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let base64url = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64url;
}

/**
 * 数据库依赖只在真正访问账号数据时加载，避免 /api/auth 模块初始化失败变成 1101。
 */
async function getSqlClient(env) {
  const { getSql } = await import('./db.js');
  return getSql(env);
}

/**
 * 认证依赖同样延迟加载，让 /api/auth/login 这类入口先进入可捕获的错误边界。
 */
async function readAuthUser(request, env) {
  const { authenticate, authorize } = await import('./auth.js');
  const user = await authenticate(request, env);
  authorize(user);
  return user;
}

/**
 * Worker 不能用 Node crypto.scrypt，这里用同样的 UTF-8 输入保持和旧后端哈希兼容。
 */
async function hashPasswordScrypt(password, salt) {
  const { default: scryptPackage } = await import('scrypt-js');
  const encoder = new TextEncoder();
  const key = await scryptPackage.scrypt(
    encoder.encode(password),
    encoder.encode(salt),
    SCryptN,
    SCryptR,
    SCryptP,
    SCryptDkLen,
  );

  return bytesToHex(key);
}

/**
 * 比较密码哈希时不提前返回，减少错误位置通过耗时泄露的可能。
 */
function constantTimeHexEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;

  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

// ── Session ──────────────────────────────────────────────────────────

function setSessionCookie(token) {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  return `sl_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return 'sl_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

// ── Handlers ─────────────────────────────────────────────────────────

/**
 * GET /api/auth/me — return the currently authenticated user.
 */
async function handleMe(request, env) {
  const user = await readAuthUser(request, env);
  return json(ok({ user }, 'User info fetched'));
}

/**
 * PATCH /api/auth/me — update profile (nickname only).
 */
async function handleUpdateMe(request, env) {
  const user = await readAuthUser(request, env);

  const body = await readJsonBody(request);
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().replace(/\s+/g, ' ') : '';

  if (!nickname) return errorJson(400, '昵称不能为空');
  if (nickname.length > 24) return errorJson(400, '昵称最多 24 个字符');

  const sql = await getSqlClient(env);
  const rows = await sql`
    UPDATE users
    SET nickname = ${nickname}, updated_at = NOW()
    WHERE id = ${user.id}
    RETURNING id, email, nickname, avatar_url, role, is_vip, access_status, access_expires_at, created_at, updated_at
  `;

  if (rows.length === 0) return errorJson(404, '用户不存在');

  const row = rows[0];
  const updated = {
    id: Number(row.id),
    email: row.email,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    role: row.role,
    isVip: row.is_vip,
    accessStatus: row.access_status,
    accessExpiresAt: new Date(row.access_expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };

  return json(ok(updated, 'Profile updated'));
}

/**
 * POST /api/auth/login
 */
async function handleLogin(request, env) {
  const body = await readJsonBody(request);
  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '');

  if (!email || !password) {
    return errorJson(401, '邮箱或密码错误');
  }

  const sql = await getSqlClient(env);

  const rows = await sql`
    SELECT id, email, nickname, avatar_url, role, is_vip,
           access_status, access_expires_at,
           password_salt, password_hash,
           created_at, updated_at
    FROM users
    WHERE email = ${email}
  `;

  if (rows.length === 0) {
    return errorJson(401, '邮箱或密码错误');
  }

  const userRow = rows[0];

  // Verify password using scrypt
  const derivedHex = await hashPasswordScrypt(password, userRow.password_salt);
  if (!constantTimeHexEqual(derivedHex, userRow.password_hash)) {
    return errorJson(401, '邮箱或密码错误');
  }

  const user = {
    id: Number(userRow.id),
    email: userRow.email,
    nickname: userRow.nickname,
    avatarUrl: userRow.avatar_url,
    role: userRow.role,
    isVip: userRow.is_vip,
    accessStatus: userRow.access_status,
    accessExpiresAt: new Date(userRow.access_expires_at).toISOString(),
    createdAt: new Date(userRow.created_at).toISOString(),
    updatedAt: new Date(userRow.updated_at).toISOString(),
  };

  // Check access
  if (user.accessStatus === 'suspended') {
    return errorJson(403, '账号已被停用，请联系管理员');
  }
  if (user.accessStatus === 'expired' || new Date(user.accessExpiresAt).getTime() <= Date.now()) {
    return errorJson(403, '账号已过期，请联系管理员续期');
  }

  // Create session
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  await sql`
    INSERT INTO user_sessions (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${tokenHash}, ${expiresAt.toISOString()}::timestamptz)
  `;

  return new Response(JSON.stringify(ok({ user }, 'Login successful')), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setSessionCookie(token),
    },
  });
}

/**
 * POST /api/auth/register
 */
async function handleRegister(request, env) {
  const body = await readJsonBody(request);
  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').trim();
  const inviteCode = (body.inviteCode || '').trim().toUpperCase();

  if (!email) return errorJson(400, '邮箱不能为空');
  if (!email.includes('@')) return errorJson(400, '请输入合法的邮箱地址');
  if (password.length < 8) return errorJson(400, '密码至少需要 8 位');
  if (!inviteCode) return errorJson(400, '访问密钥不能为空');

  const sql = await getSqlClient(env);

  // Check existing user
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    return errorJson(409, '该邮箱已注册');
  }

  // Validate access key
  const inviteHash = await sha256Hex(inviteCode);
  const keyRows = await sql`
    SELECT id, granted_days, max_uses, used_count
    FROM access_keys
    WHERE key_hash = ${inviteHash}
  `;

  if (keyRows.length === 0) return errorJson(400, '访问密钥无效或已被使用');

  const accessKey = keyRows[0];
  if (accessKey.used_count >= accessKey.max_uses) {
    return errorJson(400, '访问密钥已被使用');
  }

  // Hash password
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToHex(saltBytes);
  const passwordHash = await hashPasswordScrypt(password, salt);

  // Create user
  const accessExpiresAt = new Date();
  accessExpiresAt.setUTCDate(accessExpiresAt.getUTCDate() + Number(accessKey.granted_days));

  const nickname = email.split('@')[0]?.trim()?.slice(0, 24) || 'SceneLex';

  const userRows = await sql`
    INSERT INTO users (email, nickname, access_status, access_expires_at, password_salt, password_hash)
    VALUES (${email}, ${nickname}, 'active', ${accessExpiresAt.toISOString()}::timestamptz, ${salt}, ${passwordHash})
    RETURNING id, email, nickname, avatar_url, role, is_vip, access_status, access_expires_at, created_at, updated_at
  `;

  const userRow = userRows[0];
  const userId = Number(userRow.id);

  // Consume access key
  await sql`
    UPDATE access_keys
    SET used_count = used_count + 1, used_by_user_id = ${userId}, updated_at = NOW()
    WHERE id = ${accessKey.id}
  `;

  // Create session
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  await sql`
    INSERT INTO user_sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()}::timestamptz)
  `;

  const user = {
    id: userId,
    email: userRow.email,
    nickname: userRow.nickname,
    avatarUrl: userRow.avatar_url,
    role: userRow.role,
    isVip: userRow.is_vip,
    accessStatus: userRow.access_status,
    accessExpiresAt: new Date(userRow.access_expires_at).toISOString(),
    createdAt: new Date(userRow.created_at).toISOString(),
    updatedAt: new Date(userRow.updated_at).toISOString(),
  };

  return new Response(JSON.stringify(ok({ user }, '注册成功')), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setSessionCookie(token),
    },
  });
}

/**
 * POST /api/auth/logout
 */
async function handleLogout(request, env) {
  try {
    await readAuthUser(request, env);
  } catch {
    // Already not logged in — still clear cookie
  }

  // Read token and delete session
  const cookies = (request.headers.get('Cookie') || '').split(';');
  let token = '';
  for (const cookie of cookies) {
    const [key, val] = cookie.trim().split('=');
    if (key === 'sl_session' && val) {
      token = decodeURIComponent(val);
      break;
    }
  }

  if (token) {
    const tokenHash = await sha256Hex(token);
    const sql = await getSqlClient(env);
    await sql`DELETE FROM user_sessions WHERE token_hash = ${tokenHash}`;
  }

  return new Response(JSON.stringify(ok(null, '退出成功')), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}

// ── Main handler ─────────────────────────────────────────────────────

export async function handleAuth(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/auth', '');
    const method = request.method;

    if (path === '/me') {
      if (method === 'GET') return await handleMe(request, env);
      if (method === 'PATCH') return await handleUpdateMe(request, env);
    }

    if (path === '/login' && method === 'POST') {
      return await handleLogin(request, env);
    }

    if (path === '/register' && method === 'POST') {
      return await handleRegister(request, env);
    }

    if (path === '/logout' && method === 'POST') {
      return await handleLogout(request, env);
    }

    return errorJson(404, '路由不存在');
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) return errorJson(error.statusCode, error.message);
    if (error?.statusCode) return errorJson(error.statusCode, error.message);
    return errorJson(500, error.message || '操作失败');
  }
}
