import type { NextFunction, Request, Response } from 'express'
import { readAuthUser } from '../middlewares/auth.middleware'
import { readingHistoryService } from '../services/reading-history.service'
import { readingService } from '../services/reading.service'
import { ok } from '../utils/response'
import type {
  ReadingSentenceTranslatePayload,
  ReadingWordLookupPayload
} from '../types/reading'
import type { SaveReadingArticlePayload } from '../types/reading-history'

/**
 * 根据当前句子上下文查询单词释义。
 */
export async function lookupReadingWord(
  req: Request<Record<string, never>, object, ReadingWordLookupPayload>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await readingService.lookupWordForUser(
      authUser.id,
      req.body.word ?? '',
      req.body.sentence ?? '',
      authUser.role === 'admin',
    )
    return res.json(ok(result, 'Reading word looked up'))
  } catch (error) {
    next(error)
  }
}

/**
 * 翻译阅读页里用户点选的单句。
 */
export async function translateReadingSentence(
  req: Request<Record<string, never>, object, ReadingSentenceTranslatePayload>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await readingService.translateSentenceForUser(
      authUser.id,
      req.body.sentence ?? '',
      authUser.role === 'admin',
    )
    return res.json(ok(result, 'Reading sentence translated'))
  } catch (error) {
    next(error)
  }
}

/**
 * 保存当前用户开始阅读过的文章。
 */
export async function saveReadingArticle(
  req: Request<Record<string, never>, object, SaveReadingArticlePayload>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await readingHistoryService.save(authUser.id, req.body.content ?? '')

    return res.json(ok(result, 'Reading article saved'))
  } catch (error) {
    next(error)
  }
}

/**
 * 返回当前用户最近阅读过的文章。
 */
export async function listReadingArticles(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await readingHistoryService.list(authUser.id)

    return res.json(ok(result, 'Reading articles fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 删除当前用户的一条阅读历史。
 */
export async function deleteReadingArticle(
  req: Request<{ articleId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    await readingHistoryService.remove(authUser.id, Number(req.params.articleId))

    return res.json(ok(null, 'Reading article deleted'))
  } catch (error) {
    next(error)
  }
}

/**
 * 更新用户的一条阅读历史标题。
 */
export async function updateReadingArticleTitle(
  req: Request<{ articleId: string }, object, { title: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    await readingHistoryService.updateTitle(
      authUser.id,
      Number(req.params.articleId),
      req.body.title ?? '',
    )

    return res.json(ok(null, 'Reading article title updated'))
  } catch (error) {
    next(error)
  }
}

/**
 * 询问阅读助手关于文章内容的问题。
 */
export async function chatWithAssistant(
  req: Request<Record<string, never>, object, { content: string; question: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await readingService.chat(
      req.body.content ?? '',
      req.body.question ?? '',
      authUser.id,
      authUser.role === 'admin',
    )
    return res.json(ok(result, 'Assistant replied'))
  } catch (error) {
    next(error)
  }
}
