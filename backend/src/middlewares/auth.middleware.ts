import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import type { AuthenticatedRequest } from '../types/auth';
import { HttpError } from '../utils/http-error';
import { readSessionCookie } from '../utils/session-cookie';

/**
 * 这里统一解析会话 Cookie，业务控制器只拿已经验证过的用户对象。
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const authorization = req.headers.authorization ?? '';
    const [scheme, bearerToken] = authorization.split(' ');
    const token = readSessionCookie(req) || (scheme === 'Bearer' ? bearerToken : '');

    if (!token) {
      throw new HttpError(401, '请先登录');
    }

    const authUser = await authService.getUserByToken(token);
    const authRequest = req as AuthenticatedRequest;

    authRequest.authUser = authUser;
    authRequest.authToken = token;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * 受保护路由必须拿到当前用户，否则说明中间件链路没接好。
 */
export function readAuthUser(req: Request) {
  const authUser = (req as AuthenticatedRequest).authUser;

  if (!authUser) {
    throw new HttpError(401, '请先登录');
  }

  return authUser;
}

/**
 * 退出登录需要当前会话 token，自定义读取函数能避免控制器重复做类型断言。
 */
export function readAuthToken(req: Request) {
  const authToken = (req as AuthenticatedRequest).authToken;

  if (!authToken) {
    throw new HttpError(401, '请先登录');
  }

  return authToken;
}
