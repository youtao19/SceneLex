import type { NextFunction, Request, Response } from 'express';
import { readAuthUser } from './auth.middleware';
import { assertUserHasAccess } from '../services/auth.service';

/**
 * 登录只说明身份成立，能不能继续使用系统还要看人工授权状态和到期时间。
 */
export function accessMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    assertUserHasAccess(readAuthUser(req));
    next();
  } catch (error) {
    next(error);
  }
}
