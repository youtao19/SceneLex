import type { Request, Response, NextFunction } from 'express'
import { readAuthUser } from '../middlewares/auth.middleware'
import { wordService } from '../services/word.service'
import { ok } from '../utils/response'
import type { ReviewRating, WordMeaningItem, WordRequiredMeaning } from '../types/word'

/**
 * 轻量查词只返回词库释义，不触发模型生成场景。
 */
export async function lookupWord(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { word } = req.body as { word?: string }
    const result = await wordService.lookupWord(word ?? '')
    return res.json(ok(result, 'Word meanings fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 生成接口仍要求登录，但普通查词缓存已经是系统级内容。
 */
export async function generateWordContent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const { word, forceRegenerate, requiredMeanings, systemBookItemId } = req.body as {
      word?: string
      forceRegenerate?: boolean
      requiredMeanings?: WordRequiredMeaning[]
      systemBookItemId?: number
    }
    const result = await wordService.generateWordContent(
      word ?? '',
      forceRegenerate === true,
      requiredMeanings,
      systemBookItemId,
      authUser.id,
    )
    return res.json(ok(result, 'Word preview generated'))
  } catch (error) {
    next(error)
  }
}

/**
 * 添加单词时直接保存前端确认过的 meanings，避免再次调用模型导致结果飘移。
 */
export async function addWord(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const { word, phonetic, meanings, bookIds } = req.body as {
      word?: string
      phonetic?: string
      meanings?: WordMeaningItem[]
      bookIds?: number[]
    }
    const result = await wordService.addWordToReview(
      authUser.id,
      word ?? '',
      phonetic,
      meanings,
      bookIds
    )
    const message = result.wasUpdated ? 'Word updated' : 'Word added'

    return res.json(ok(result.card, message))
  } catch (error) {
    next(error)
  }
}

/**
 * 今日任务页按到期时间拉取整张单词卡，前端逐张消费。
 */
export async function getTodayWords(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await wordService.getTodayReviewWords(authUser.id)
    return res.json(ok(result, 'Today words fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 评分后只推进 SRS 计划，不重新生成教学内容。
 */
export async function reviewWord(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const { wordId, rating } = req.body as {
      wordId?: number
      rating?: ReviewRating
    }
    const result = await wordService.reviewWord(
      authUser.id,
      Number(wordId),
      rating as ReviewRating
    )
    return res.json(ok(result, 'Word review updated'))
  } catch (error) {
    next(error)
  }
}
