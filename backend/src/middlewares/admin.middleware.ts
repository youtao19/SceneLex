import type { NextFunction, Request, Response } from 'express';
import { readAuthUser } from './auth.middleware';
import { HttpError } from '../utils/http-error';

/**
 * 管理接口必须在身份和访问状态都通过后再校验角色，避免停用管理员继续操作系统。
 */
export function adminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const user = readAuthUser(req);

    if (user.role !== 'admin') {
      throw new HttpError(403, '需要管理员权限');
    }

    next();
  } catch (error) {
    next(error);
  }
}
