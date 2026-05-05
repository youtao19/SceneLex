import {
  createReadingAssistantChat,
  createReadingAssistantMessage,
  findReadingAssistantChat,
  listReadingAssistantChats,
  listReadingAssistantMessages,
} from '../repositories/reading-assistant.repository'
import { readingService } from './reading.service'
import type {
  CreateReadingAssistantChatPayload,
  ReadingAssistantMessage,
  SendReadingAssistantMessagePayload,
} from '../types/reading'
import { HttpError } from '../utils/http-error'

function readId(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, '聊天 id 非法')
  }

  return id
}

/**
 * 聊天标题默认来自文章第一行，短标题更接近 ChatGPT 的历史列表体验。
 */
function buildChatTitle(content: string, title?: string) {
  const source = title?.trim() || content.split('\n').map((line) => line.trim()).find(Boolean) || '阅读聊天'
  return source.slice(0, 40)
}

function normalizeContent(content: string) {
  const text = content.trim()

  if (!text) {
    throw new HttpError(400, '文章内容不能为空')
  }

  if (text.length > 10000) {
    throw new HttpError(400, '文章内容太长，请缩短后重试')
  }

  return text
}

function normalizeQuestion(question: string) {
  const text = question.trim()

  if (!text) {
    throw new HttpError(400, '问题不能为空')
  }

  if (text.length > 1000) {
    throw new HttpError(400, '问题太长，请缩短后重试')
  }

  return text
}

/**
 * 只带最近几轮对话给模型，保留上下文但不让 prompt 随历史无限增长。
 */
function buildRecentHistory(messages: ReadingAssistantMessage[]) {
  return messages.slice(-8).map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

interface StreamMessageHandlers {
  onUserMessage: (message: ReadingAssistantMessage) => void | Promise<void>
  onDelta: (delta: string) => void | Promise<void>
}

export const readingAssistantService = {
  /**
   * 读取当前用户的助手聊天历史。
   */
  async listChats(userId: number) {
    return listReadingAssistantChats(userId)
  },

  /**
   * 创建一个新的阅读助手聊天。
   */
  async createChat(userId: number, payload: CreateReadingAssistantChatPayload) {
    const content = normalizeContent(payload.content ?? '')
    return createReadingAssistantChat(userId, buildChatTitle(content, payload.title), content)
  },

  /**
   * 读取某个聊天的消息。
   */
  async listMessages(userId: number, chatIdInput: string) {
    const chatId = readId(chatIdInput)
    const chat = await findReadingAssistantChat(userId, chatId)

    if (!chat) {
      throw new HttpError(404, '聊天不存在')
    }

    return listReadingAssistantMessages(chat.id)
  },

  /**
   * 向已有聊天发送消息，并把用户消息和助手回复都保存下来。
   */
  async sendMessage(
    userId: number,
    chatIdInput: string,
    payload: SendReadingAssistantMessagePayload,
  ) {
    const chatId = readId(chatIdInput)
    const question = normalizeQuestion(payload.question ?? '')
    const chat = await findReadingAssistantChat(userId, chatId)

    if (!chat) {
      throw new HttpError(404, '聊天不存在')
    }

    const previousMessages = await listReadingAssistantMessages(chat.id)
    const userMessage = await createReadingAssistantMessage(chat.id, 'user', question)
    const answer = await readingService.chatWithHistory(
      chat.articleContent,
      question,
      buildRecentHistory(previousMessages),
    )
    const assistantMessage = await createReadingAssistantMessage(chat.id, 'assistant', answer.text)

    return {
      userMessage,
      assistantMessage,
    }
  },

  /**
   * 流式发送时先落用户消息，助手完整回复在 token 收齐后再落库。
   */
  async streamMessage(
    userId: number,
    chatIdInput: string,
    payload: SendReadingAssistantMessagePayload,
    handlers: StreamMessageHandlers,
  ) {
    const chatId = readId(chatIdInput)
    const question = normalizeQuestion(payload.question ?? '')
    const chat = await findReadingAssistantChat(userId, chatId)

    if (!chat) {
      throw new HttpError(404, '聊天不存在')
    }

    const previousMessages = await listReadingAssistantMessages(chat.id)
    const userMessage = await createReadingAssistantMessage(chat.id, 'user', question)
    await handlers.onUserMessage(userMessage)

    const answer = await readingService.chatWithHistoryStream(
      chat.articleContent,
      question,
      buildRecentHistory(previousMessages),
      handlers.onDelta,
    )
    const assistantMessage = await createReadingAssistantMessage(chat.id, 'assistant', answer.text)

    return {
      userMessage,
      assistantMessage,
    }
  },
}
