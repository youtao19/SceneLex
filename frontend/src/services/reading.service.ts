import { del, get, patch, post, readAuthToken } from './http'
import type { ApiResponse } from '../types/api'
import type {
  ReadingAssistantChat,
  ReadingAssistantMessage,
  ReadingArticle,
  ReadingSentenceTranslateData,
  ReadingWordLookupData
} from '../types/reading'

export function fetchReadingArticles() {
  return get<ApiResponse<ReadingArticle[]>>('/reading/articles')
}

export function saveReadingArticle(content: string) {
  return post<ApiResponse<ReadingArticle>>('/reading/articles', { content })
}

export function deleteReadingArticle(articleId: number) {
  return del<ApiResponse<null>>(`/reading/articles/${articleId}`)
}

export function updateReadingArticleTitle(articleId: number, title: string) {
  return patch<ApiResponse<null>>(`/reading/articles/${articleId}/title`, { title })
}

/**
 * 单词查询带上句子上下文，避免多义词脱离语境。
 */
export function lookupReadingWord(word: string, sentence: string) {
  return post<ApiResponse<ReadingWordLookupData>>('/reading/word', { word, sentence })
}

/**
 * 阅读页按需翻译单句，后端只返回最终中文。
 */
export function translateReadingSentence(sentence: string) {
  return post<ApiResponse<ReadingSentenceTranslateData>>('/reading/sentence', { sentence })
}

export function chatWithAssistant(content: string, question: string) {
  return post<ApiResponse<{ text: string }>>('/reading/chat', { content, question })
}

export function fetchAssistantChats() {
  return get<ApiResponse<ReadingAssistantChat[]>>('/reading/assistant-chats')
}

export function createAssistantChat(content: string, title?: string) {
  return post<ApiResponse<ReadingAssistantChat>>('/reading/assistant-chats', { content, title })
}

export function fetchAssistantMessages(chatId: number) {
  return get<ApiResponse<ReadingAssistantMessage[]>>(`/reading/assistant-chats/${chatId}/messages`)
}

export function sendAssistantMessage(chatId: number, question: string) {
  return post<ApiResponse<{
    userMessage: ReadingAssistantMessage
    assistantMessage: ReadingAssistantMessage
  }>>(`/reading/assistant-chats/${chatId}/messages`, { question })
}

type AssistantStreamEvent =
  | { type: 'user_message'; message: ReadingAssistantMessage }
  | { type: 'delta'; delta: string }
  | { type: 'done'; assistantMessage: ReadingAssistantMessage }
  | { type: 'error'; message: string }

interface AssistantStreamHandlers {
  onUserMessage: (message: ReadingAssistantMessage) => void
  onDelta: (delta: string) => void
  onDone: (message: ReadingAssistantMessage) => void
}

/**
 * 流式接口出错时可能已经不是 JSON，保留文本兜底更容易定位模型错误。
 */
function readStreamErrorMessage(response: Response) {
  return response.text().then((text) => {
    try {
      const data = JSON.parse(text) as { message?: string }
      return data.message || '请求失败'
    } catch {
      return text || '请求失败'
    }
  })
}

/**
 * 后端每个 SSE 事件只放一个 data JSON，前端按事件类型更新聊天状态。
 */
function parseAssistantStreamEvent(block: string): AssistantStreamEvent | null {
  const payload = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')

  if (!payload) {
    return null
  }

  return JSON.parse(payload) as AssistantStreamEvent
}

/**
 * 阅读助手流式接口用 POST 传问题，因此用 fetch 读取 SSE，而不是 EventSource。
 */
export async function sendAssistantMessageStream(
  chatId: number,
  question: string,
  handlers: AssistantStreamHandlers,
) {
  const headers = new Headers({
    'Content-Type': 'application/json'
  })
  const token = readAuthToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`/api/reading/assistant-chats/${chatId}/messages/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question })
  })

  if (!response.ok) {
    throw new Error(await readStreamErrorMessage(response))
  }

  if (!response.body) {
    throw new Error('浏览器没有返回可读取的响应流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const event = parseAssistantStreamEvent(block)

      if (!event) {
        continue
      }

      if (event.type === 'user_message') {
        handlers.onUserMessage(event.message)
      } else if (event.type === 'delta') {
        handlers.onDelta(event.delta)
      } else if (event.type === 'done') {
        handlers.onDone(event.assistantMessage)
      } else {
        throw new Error(event.message)
      }
    }
  }

  if (buffer.trim()) {
    const event = parseAssistantStreamEvent(buffer)

    if (event?.type === 'user_message') {
      handlers.onUserMessage(event.message)
    } else if (event?.type === 'delta') {
      handlers.onDelta(event.delta)
    } else if (event?.type === 'done') {
      handlers.onDone(event.assistantMessage)
    } else if (event?.type === 'error') {
      throw new Error(event.message)
    }
  }
}
