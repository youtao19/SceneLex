import type { Request, Response, NextFunction } from 'express'
import { readAuthUser } from '../middlewares/auth.middleware'
import { settingsService } from '../services/settings.service'
import { ok } from '../utils/response'

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
 * 保存后立即影响下一次读取今日复习队列和新词队列。
 * 没提交的字段保持原值，老网页只发复习限制也不会把新词目标清零。
 */
export async function updateLearningSettings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await settingsService.updateLearningSettings(
      authUser.id,
      req.body as {
        dailyReviewLimitEnabled?: unknown
        dailyReviewLimit?: unknown
        dailyNewWordTarget?: unknown
        currentSystemBookId?: unknown
      }
    )

    return res.json(ok(result, 'Learning settings updated'))
  } catch (error) {
    next(error)
  }
}
