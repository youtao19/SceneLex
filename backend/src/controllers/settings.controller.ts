import type { Request, Response, NextFunction } from 'express'
import { isAiProvider, readAiSettings, updateAiSettings } from '../config/ai'
import { ok } from '../utils/response'
import { HttpError } from '../utils/http-error'

/**
 * 设置页需要读取当前真实运行态，而不是展示前端写死的占位值。
 */
export async function getAiSettings(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    return res.json(ok(readAiSettings(), 'AI settings fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 只允许切换 provider 和 model，连接地址与密钥仍由本机环境管理。
 */
export async function updateAiModelSettings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { provider, model } = req.body as {
      provider?: string
      model?: string
    }
    const cleanProvider = provider?.trim().toLowerCase() ?? ''
    const cleanModel = model?.trim() ?? ''

    if (!isAiProvider(cleanProvider)) {
      throw new HttpError(400, '模型服务只支持 ollama、omlx 或 deepseek')
    }

    if (!cleanModel) {
      throw new HttpError(400, '模型名称不能为空')
    }

    return res.json(ok(updateAiSettings(cleanProvider, cleanModel), 'AI settings updated'))
  } catch (error) {
    next(error)
  }
}
