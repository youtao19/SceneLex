import { getSql } from './db.js';

const SESSION_COOKIE = 'sl_session';

/**
 * SHA-256 hex digest via Web Crypto API.
 */
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parse Cookie header into a Map.
 */
function parseCookies(header) {
  const cookies = new Map();
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies.set(key, decodeURIComponent(value));
  }

  return cookies;
}

/**
 * Read session token from cookie or Authorization header.
 */
function readSessionToken(request) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const cookieToken = cookies.get(SESSION_COOKIE);
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('Authorization') || '';
  const [scheme, bearerToken] = authHeader.split(' ');
  if (scheme === 'Bearer' && bearerToken) return bearerToken;

  return '';
}

/**
 * Validate session and return AuthUser, or throw an HttpError-like object.
 */
export async function authenticate(request, env) {
  const token = readSessionToken(request);
  if (!token) {
    throw new AuthError(401, '请先登录');
  }

  const tokenHash = await sha256Hex(token);
  const sql = getSql(env);

  const rows = await sql`
    SELECT
      u.id,
      u.email,
      u.nickname,
      u.avatar_url,
      u.role,
      u.is_vip,
      u.access_status,
      u.access_expires_at,
      u.created_at,
      u.updated_at
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > NOW()
  `;

  if (rows.length === 0) {
    throw new AuthError(401, '登录已失效，请重新登录');
  }

  // Touch session
  await sql`UPDATE user_sessions SET last_used_at = NOW() WHERE token_hash = ${tokenHash}`;

  const row = rows[0];
  return {
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
}

/**
 * Check user access status. Throws AuthError if suspended or expired.
 */
export function authorize(user) {
  if (user.accessStatus === 'suspended') {
    throw new AuthError(403, '账号已被停用，请联系管理员');
  }

  if (
    user.accessStatus === 'expired' ||
    new Date(user.accessExpiresAt).getTime() <= Date.now()
  ) {
    throw new AuthError(403, '账号已过期，请联系管理员续期');
  }
}

/**
 * HTTP error with status code, like Express HttpError.
 */
export class AuthError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
