import type { Request, Response, NextFunction } from 'express'
import { wordService } from '../services/word.service'
import { ok } from '../utils/response'
import type { ReviewRating, WordMeaningItem } from '../types/word'

/**
 * 生成预览内容时仍走当前 prompt，这里只负责接住请求并返回统一响应。
 */
export async function generateWordContent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { word } = req.body as { word?: string }
    const result = await wordService.generateWordContent(word ?? '')
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
    const { word, meanings } = req.body as {
      word?: string
      meanings?: WordMeaningItem[]
    }
    const result = await wordService.addWordToReview(word ?? '', meanings)
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
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await wordService.getTodayReviewWords()
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
    const { wordId, rating } = req.body as {
      wordId?: number
      rating?: ReviewRating
    }
    const result = await wordService.reviewWord(Number(wordId), rating as ReviewRating)
    return res.json(ok(result, 'Word review updated'))
  } catch (error) {
    next(error)
  }
}
