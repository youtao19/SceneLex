import type { Request, Response, NextFunction } from 'express'
import { ENDPOINT_PRESETS } from '../config/endpoint-presets'
import { readAuthUser } from '../middlewares/auth.middleware'
import { endpointService } from '../services/endpoint.service'
import { HttpError } from '../utils/http-error'
import { ok } from '../utils/response'
import { canUseSystemEndpoint } from '../utils/system-endpoint-access'

/**
 * 路径参数必须收敛成正整数，否则会把 NaN 传进 SQL。
 */
function readEndpointId(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, '端点 id 非法')
  }

  return id
}

/**
 * 预设跟着列表一起返回：前端抽屉里的预设卡片和端点列表是同一个页面的两块，
 * 分成两个请求只会让首屏多一次往返。
 *
 * system 只告诉前端「你还有没有系统端点可用」，不返回地址和密钥。
 */
export async function listEndpoints(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req)
    const endpoints = await endpointService.listEndpoints(authUser.id)
    const canUse = canUseSystemEndpoint(authUser)
    const systemView = canUse ? await endpointService.readSystemEndpoint() : null

    return res.json(
      ok(
        {
          endpoints,
          presets: ENDPOINT_PRESETS,
          system: {
            canUse,
            available: Boolean(systemView),
            label: systemView?.label ?? null,
            model: systemView?.model ?? null,
          },
        },
        'Endpoints fetched',
      ),
    )
  } catch (error) {
    next(error)
  }
}

export async function createEndpoint(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = readAuthUser(req)
    const result = await endpointService.createEndpoint(authUser.id, req.body)

    return res.json(ok(result, 'Endpoint created'))
  } catch (error) {
    next(error)
  }
}

export async function updateEndpoint(
  req: Request<{ endpointId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await endpointService.updateEndpoint(
      authUser.id,
      readEndpointId(req.params.endpointId),
      req.body,
    )

    return res.json(ok(result, 'Endpoint updated'))
  } catch (error) {
    next(error)
  }
}

export async function deleteEndpoint(
  req: Request<{ endpointId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    await endpointService.deleteEndpoint(authUser.id, readEndpointId(req.params.endpointId))

    return res.json(ok(null, 'Endpoint deleted'))
  } catch (error) {
    next(error)
  }
}

export async function setDefaultEndpoint(
  req: Request<{ endpointId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const endpoints = await endpointService.setDefaultEndpoint(
      authUser.id,
      readEndpointId(req.params.endpointId),
    )

    return res.json(ok(endpoints, 'Default endpoint updated'))
  } catch (error) {
    next(error)
  }
}

/**
 * 测试连接不落库，所以它也要走同一套 SSRF 校验 ——
 * 这个按钮本身就是「让服务器去请求用户填的地址」的入口。
 */
export async function testEndpointConnection(req: Request, res: Response, next: NextFunction) {
  try {
    readAuthUser(req)
    const result = await endpointService.testConnection(req.body)

    return res.json(ok(result, 'Endpoint connection tested'))
  } catch (error) {
    next(error)
  }
}

/**
 * 测试已保存的端点：卡片上的「测试」按钮拿不到密钥明文，所以必须走后端解密。
 */
export async function testSavedEndpoint(
  req: Request<{ endpointId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await endpointService.testSavedEndpoint(
      authUser.id,
      readEndpointId(req.params.endpointId),
    )

    return res.json(ok(result, 'Endpoint connection tested'))
  } catch (error) {
    next(error)
  }
}
