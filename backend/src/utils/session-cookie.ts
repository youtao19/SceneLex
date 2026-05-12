import type { Request, Response } from 'express';
import { env } from '../config/env';

const SESSION_COOKIE_NAME = 'sl_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 这里手动解析 Cookie，避免为了一个会话字段额外引入中间件依赖。
 */
function parseCookieHeader(header: string | undefined) {
  const cookies = new Map<string, string>();

  if (!header) {
    return cookies;
  }

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (key) {
      cookies.set(key, decodeURIComponent(value));
    }
  }

  return cookies;
}

/**
 * 会话放在 HttpOnly Cookie，前端脚本不能直接读取 token。
 */
export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/**
 * 退出登录时必须让浏览器删除 HttpOnly Cookie，否则前端无法自行清理。
 */
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * 受保护接口只读取 Cookie 里的会话 token，前端不需要接触明文。
 */
export function readSessionCookie(req: Request) {
  return parseCookieHeader(req.headers.cookie).get(SESSION_COOKIE_NAME) ?? '';
}
