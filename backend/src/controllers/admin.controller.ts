import type { NextFunction, Request, Response } from 'express';
import { readAuthUser } from '../middlewares/auth.middleware';
import { adminService } from '../services/admin.service';
import type {
  CreateAdminAccessKeyPayload,
  UpdateAdminAccessKeyPayload,
  UpdateAdminUserAccessPayload,
  UpdateAdminUserRolePayload,
} from '../types/admin';
import { ok } from '../utils/response';

/**
 * Express 5 类型允许 params 是数组，这里收敛成路由实际使用的单值字符串。
 */
function readRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 用户管理列表。
 */
export async function listUsers(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(ok(await adminService.listUsers(), '用户列表已获取'));
  } catch (error) {
    next(error);
  }
}

/**
 * 更新用户可用状态。
 */
export async function updateUserAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = req.body as UpdateAdminUserAccessPayload;
    const authUser = readAuthUser(req);
    const user = await adminService.updateUserAccess(
      authUser.id,
      readRouteParam(req.params.userId),
      payload,
    );
    return res.json(ok(user, '用户权限已更新'));
  } catch (error) {
    next(error);
  }
}

/**
 * 更新用户角色。
 */
export async function updateUserRole(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = req.body as UpdateAdminUserRolePayload;
    const authUser = readAuthUser(req);
    const user = await adminService.updateUserRole(
      authUser.id,
      readRouteParam(req.params.userId),
      payload,
    );
    return res.json(ok(user, '用户角色已更新'));
  } catch (error) {
    next(error);
  }
}

/**
 * 密钥管理列表。
 */
export async function listAccessKeys(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(ok(await adminService.listAccessKeys(), '密钥列表已获取'));
  } catch (error) {
    next(error);
  }
}

/**
 * 创建访问密钥。
 */
export async function createAccessKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = req.body as CreateAdminAccessKeyPayload;
    const accessKey = await adminService.createAccessKey(payload);
    return res.json(ok(accessKey, '密钥已创建'));
  } catch (error) {
    next(error);
  }
}

/**
 * 更新访问密钥状态。
 */
export async function updateAccessKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = req.body as UpdateAdminAccessKeyPayload;
    const accessKey = await adminService.updateAccessKey(readRouteParam(req.params.accessKeyId), payload);
    return res.json(ok(accessKey, '密钥状态已更新'));
  } catch (error) {
    next(error);
  }
}
