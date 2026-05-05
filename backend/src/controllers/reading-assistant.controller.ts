import type { NextFunction, Request, Response } from 'express'
import { readAuthUser } from '../middlewares/auth.middleware'
import { readingAssistantService } from '../services/reading-assistant.service'
import type {
  CreateReadingAssistantChatPayload,
  SendReadingAssistantMessagePayload,
} from '../types/reading'
import { ok } from '../utils/response'

/**
 * SSE 每个事件必须以空行结尾，浏览器才会立刻把增量交给前端读取器。
 */
function writeStreamEvent(res: Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

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

/**
 * 流式发送消息，前端可以像 ChatGPT 一样逐段渲染助手回复。
 */
export async function streamAssistantMessage(
  req: Request<{ chatId: string }, object, SendReadingAssistantMessagePayload>,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = readAuthUser(req)

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const result = await readingAssistantService.streamMessage(
      authUser.id,
      req.params.chatId,
      req.body,
      {
        onUserMessage: (message) => {
          writeStreamEvent(res, {
            type: 'user_message',
            message,
          })
        },
        onDelta: (delta) => {
          writeStreamEvent(res, {
            type: 'delta',
            delta,
          })
        },
      },
    )

    writeStreamEvent(res, {
      type: 'done',
      assistantMessage: result.assistantMessage,
    })
    res.end()
  } catch (error) {
    if (res.headersSent) {
      writeStreamEvent(res, {
        type: 'error',
        message: error instanceof Error ? error.message : '助手回复失败',
      })
      res.end()
      return
    }

    next(error)
  }
}
