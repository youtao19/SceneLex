import type { NextFunction, Request, Response } from 'express';
import { readAuthUser } from '../middlewares/auth.middleware';
import { adminService } from '../services/admin.service';
import type {
  CreateAdminAccessKeyPayload,
  UpdateAdminAccessKeyPayload,
  UpdateAdminUserAccessPayload,
  UpdateAdminUserRolePayload,
  UpdateAdminUserVipPayload,
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
 * 开通或取消 VIP。
 */
export async function updateUserVip(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payload = req.body as UpdateAdminUserVipPayload;
    const authUser = readAuthUser(req);
    const user = await adminService.updateUserVip(
      authUser.id,
      readRouteParam(req.params.userId),
      payload,
    );
    return res.json(ok(user, '用户 VIP 状态已更新'));
  } catch (error) {
    next(error);
  }
}

/**
 * 模型用量总览。配额上限也一起返回，页面不用自己知道默认值。
 */
export async function getUsageOverview(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(ok(await adminService.readUsageOverview(), '模型用量已获取'));
  } catch (error) {
    next(error);
  }
}

/**
 * 读取系统端点配置。没配过时返回 null，前端据此显示「还没配置」。
 */
export async function getSystemEndpoint(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(ok(await adminService.readSystemEndpoint(), 'System endpoint fetched'));
  } catch (error) {
    next(error);
  }
}

/**
 * 保存系统端点：VIP 用户没有自己的端点时会用它。
 */
export async function saveSystemEndpoint(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(ok(await adminService.saveSystemEndpoint(req.body), 'System endpoint saved'));
  } catch (error) {
    next(error);
  }
}

/**
 * 删除后 VIP 用户如果没有自己的端点就不能再用模型，所以前端要二次确认。
 */
export async function deleteSystemEndpoint(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await adminService.deleteSystemEndpoint();
    return res.json(ok(null, 'System endpoint deleted'));
  } catch (error) {
    next(error);
  }
}

/**
 * 保存前测试连通性，配置错了不用等用户来报。
 */
export async function testSystemEndpoint(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return res.json(ok(await adminService.testSystemEndpoint(req.body), 'System endpoint tested'));
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
