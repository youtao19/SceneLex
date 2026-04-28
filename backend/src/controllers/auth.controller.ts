import type { NextFunction, Request, Response } from 'express';
import {
  readAuthToken,
  readAuthUser,
} from '../middlewares/auth.middleware';
import { authService } from '../services/auth.service';
import type { LoginPayload, RegisterPayload, UpdateProfilePayload } from '../types/auth';
import { ok } from '../utils/response';

/**
 * 注册时由服务层统一创建用户和会话，控制器只负责协议转换。
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = req.body as RegisterPayload;
    const result = await authService.register(payload);
    return res.json(ok(result, '注册成功'));
  } catch (error) {
    next(error);
  }
}

/**
 * 登录成功后直接回传 token 和用户信息，前端可以立刻进入业务页。
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = req.body as LoginPayload;
    const result = await authService.login(payload);
    return res.json(ok(result, '登录成功'));
  } catch (error) {
    next(error);
  }
}

/**
 * 当前用户信息由中间件提前校验，避免每个控制器重复解析 token。
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(ok(readAuthUser(req), '当前用户已获取'));
  } catch (error) {
    next(error);
  }
}

/**
 * 用户资料更新以当前 token 为准，前端不需要也不能提交 userId。
 */
export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req);
    const payload = req.body as UpdateProfilePayload;
    const result = await authService.updateProfile(authUser.id, payload);
    return res.json(ok(result, '个人资料已更新'));
  } catch (error) {
    next(error);
  }
}

/**
 * 退出只需要删除当前会话，不需要前端再带额外 userId。
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await authService.logout(readAuthToken(req));
    return res.json(ok(null, '已退出登录'));
  } catch (error) {
    next(error);
  }
}
