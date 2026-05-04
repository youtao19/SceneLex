import type { Request, Response, NextFunction } from 'express'
import { isAiProvider, readAiSettings, updateAiSettings } from '../config/ai'
import { readAuthUser } from '../middlewares/auth.middleware'
import { settingsService } from '../services/settings.service'
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
 * 学习设置按用户保存，控制复习舱每天最多推送多少到期单词。
 */
export async function getLearningSettings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await settingsService.getLearningSettings(authUser.id)

    return res.json(ok(result, 'Learning settings fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 保存后立即影响下一次读取今日复习队列。
 */
export async function updateLearningSettings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const { dailyReviewLimitEnabled, dailyReviewLimit } = req.body as {
      dailyReviewLimitEnabled?: unknown
      dailyReviewLimit?: unknown
    }
    const result = await settingsService.updateLearningSettings(
      authUser.id,
      dailyReviewLimitEnabled,
      dailyReviewLimit
    )

    return res.json(ok(result, 'Learning settings updated'))
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
