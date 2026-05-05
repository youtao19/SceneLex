import type { NextFunction, Request, Response } from 'express'
import { readAuthUser } from '../middlewares/auth.middleware'
import { readingAssistantService } from '../services/reading-assistant.service'
import type {
  CreateReadingAssistantChatPayload,
  SendReadingAssistantMessagePayload,
} from '../types/reading'
import { ok } from '../utils/response'

/**
 * 获取阅读助手聊天历史。
 */
export async function listAssistantChats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    return res.json(ok(await readingAssistantService.listChats(authUser.id), 'Assistant chats fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 创建新的阅读助手聊天。
 */
export async function createAssistantChat(
  req: Request<Record<string, never>, object, CreateReadingAssistantChatPayload>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const chat = await readingAssistantService.createChat(authUser.id, req.body)
    return res.json(ok(chat, 'Assistant chat created'))
  } catch (error) {
    next(error)
  }
}

/**
 * 获取某个聊天下的消息。
 */
export async function listAssistantMessages(
  req: Request<{ chatId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const messages = await readingAssistantService.listMessages(authUser.id, req.params.chatId)
    return res.json(ok(messages, 'Assistant messages fetched'))
  } catch (error) {
    next(error)
  }
}

/**
 * 向某个历史聊天继续发送消息。
 */
export async function sendAssistantMessage(
  req: Request<{ chatId: string }, object, SendReadingAssistantMessagePayload>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)
    const result = await readingAssistantService.sendMessage(authUser.id, req.params.chatId, req.body)
    return res.json(ok(result, 'Assistant replied'))
  } catch (error) {
    next(error)
  }
}
