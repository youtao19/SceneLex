import type { Request, Response, NextFunction } from 'express'
import { readAuthUser } from '../middlewares/auth.middleware'
import { endpointService } from '../services/endpoint.service'
import { wordService } from '../services/word.service'
import { ok } from '../utils/response'
import type {
  CompleteNewWordPayload,
  ReviewRollbackPayload,
  ReviewWordPayload,
  WordMeaningItem,
  WordRequiredMeaning,
} from '../types/word'

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
    // 端点可能为空：命中系统词卡缓存时不需要调模型。
    const endpoint = await endpointService.findEndpointForUser(authUser)
    const result = await wordService.generateWordContent(
      authUser.id,
      word ?? '',
      forceRegenerate === true,
      requiredMeanings,
      systemBookItemId,
      endpoint,
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
 * 带 operationId 的重试会拿到同一份结果，不会重复计数。
 */
export async function reviewWord(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await wordService.reviewWord(authUser.id, req.body as ReviewWordPayload)

    return res.json(ok(result, 'Word review updated'))
  } catch (error) {
    next(error)
  }
}

/**
 * 用户看完答案发现选错时，按服务端记录的评分操作恢复排期。
 */
export async function rollbackReviewWord(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await wordService.rollbackReviewWord(
      authUser.id,
      req.body as ReviewRollbackPayload
    )

    return res.json(ok(result, 'Word review rolled back'))
  } catch (error) {
    next(error)
  }
}

/**
 * 学习概览是移动端首页的入口：新词计划、当前词书和到期数一次拿齐。
 */
export async function getStudyOverview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await wordService.getStudyOverview(authUser.id)

    return res.json(ok(result, 'Study overview fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 顺序新词队列；limit 只在用户想超过今日目标继续学时才传。
 */
export async function listNewWords(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await wordService.listNewWords(authUser.id, req.query.limit)

    return res.json(ok(result, 'New words fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 完成新词：保存词卡、首次评分和当日计数由服务层在同一事务完成。
 */
export async function completeNewWord(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = readAuthUser(req)
    const result = await wordService.completeNewWord(
      authUser.id,
      req.body as CompleteNewWordPayload
    )

    return res.json(ok(result, 'New word completed'))
  } catch (error) {
    next(error)
  }
}
