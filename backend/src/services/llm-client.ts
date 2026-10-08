import { readTrustedEndpointUrls } from '../config/endpoint-presets'
import { HttpError } from '../utils/http-error'
import { safeFetch } from '../utils/ssrf-guard'
import type { AiEndpoint } from '../types/endpoint'

/**
 * 唯一的模型出站客户端：OpenAI-compatible 的 /v1/chat/completions。
 *
 * 为什么只做这一条路径：用户填什么地址都要能接，而 chat/completions 是事实标准，
 * Ollama、vLLM、LM Studio、DeepSeek、Kimi、OpenRouter 全都实现。
 * /v1/responses 的核心价值是服务端状态，而 Ollama 明确只支持非状态化版本，
 * 换过去只会丢掉兼容性。
 */

export interface TextContentPart {
  type: 'text'
  text: string
}

export interface ImageContentPart {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export type MessageContent = string | Array<TextContentPart | ImageContentPart>

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: MessageContent
}

export interface ChatCompletionOptions {
  /** 要求模型返回 JSON object，用于词卡这类结构化输出。 */
  json?: boolean
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

export interface ChatCompletionResult {
  content: string
  finishReason: string
}

/**
 * 继承 HttpError 是为了让状态码正确：模型服务失败是上游问题（502），
 * 不是我们的 500，前端也不该把它当成服务端 bug 上报。
 */
export class LlmRequestError extends HttpError {
  constructor(message: string) {
    super(502, message)
  }
}

const DEFAULT_TIMEOUT = 120_000

/**
 * 上游错误可能包含密钥或很长的 JSON，只取短摘要反馈给用户。
 */
export function summarizeUpstreamError(text: string) {
  const cleanText = text.trim()

  if (!cleanText) {
    return '没有返回错误详情'
  }

  try {
    const data = JSON.parse(cleanText) as {
      error?: { message?: string }
      message?: string
    }
    const message = data.error?.message ?? data.message

    if (message) {
      return message.slice(0, 180)
    }
  } catch {
    // 非 JSON 错误直接走下面的文本摘要。
  }

  return cleanText.slice(0, 180)
}

/** baseUrl 末尾的斜杠会让拼接出双斜杠，统一去掉。 */
function buildChatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
}

function buildHeaders(endpoint: AiEndpoint) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 本机 Ollama 不校验密钥，但有些兼容层要求 Authorization 存在。
  if (endpoint.apiKey) {
    headers.Authorization = `Bearer ${endpoint.apiKey}`
  }

  return headers
}

export function buildVisionMessage(prompt: string, imageBase64: string, mimeType: string): ChatMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        // 必须用 base64 data URL：Ollama 的 chat/completions 不支持直接传图片 URL。
        image_url: { url: `data:${mimeType};base64,${imageBase64}` },
      },
    ],
  }
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null
    message?: { content?: string | null }
  }>
}

interface ChatCompletionStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null }
  }>
}

function buildBody(endpoint: AiEndpoint, messages: ChatMessage[], options: ChatCompletionOptions, stream: boolean) {
  return {
    model: endpoint.model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2400,
    stream,
    ...(options.json ? { response_format: { type: 'json_object' } } : {}),
  }
}

/**
 * 超时错误名在不同运行时不一致，统一成用户能看懂的提示。
 */
function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' ||
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('timeout'))
  )
}

async function readErrorMessage(response: Response) {
  try {
    return summarizeUpstreamError(await response.text())
  } catch {
    return '读取错误响应失败'
  }
}

export async function chatCompletion(
  endpoint: AiEndpoint,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<ChatCompletionResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT
  let response: Response

  try {
    response = await safeFetch(
      buildChatCompletionsUrl(endpoint.baseUrl),
      {
        method: 'POST',
        headers: buildHeaders(endpoint),
        body: JSON.stringify(buildBody(endpoint, messages, options, false)),
        signal: AbortSignal.timeout(timeoutMs),
      },
      { trustedUrls: readTrustedEndpointUrls(), allowPrivateAddresses: endpoint.trusted },
    )
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new LlmRequestError(`模型请求超时（${Math.round(timeoutMs / 1000)} 秒）`)
    }

    throw new LlmRequestError(
      `模型请求失败：${error instanceof Error ? error.message : '网络错误'}`,
    )
  }

  if (!response.ok) {
    throw new LlmRequestError(`模型返回 ${response.status}：${await readErrorMessage(response)}`)
  }

  const data = (await response.json()) as ChatCompletionResponse
  const choice = data.choices?.[0]
  const content = choice?.message?.content

  if (!content || !content.trim()) {
    throw new LlmRequestError('模型没有返回内容')
  }

  return {
    content: content.trim(),
    finishReason: choice?.finish_reason ?? '',
  }
}

/**
 * SSE 里一个 event 可能有多行 data，先拼成完整 JSON 再取 delta。
 */
function readStreamDelta(event: string) {
  const payload = event
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')

  if (!payload || payload === '[DONE]') {
    return ''
  }

  const data = JSON.parse(payload) as ChatCompletionStreamChunk

  return data.choices?.[0]?.delta?.content ?? ''
}

export type StreamDeltaHandler = (delta: string) => void | Promise<void>

export async function chatCompletionStream(
  endpoint: AiEndpoint,
  messages: ChatMessage[],
  onDelta: StreamDeltaHandler,
  options: ChatCompletionOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT
  let response: Response

  try {
    response = await safeFetch(
      buildChatCompletionsUrl(endpoint.baseUrl),
      {
        method: 'POST',
        headers: buildHeaders(endpoint),
        body: JSON.stringify(buildBody(endpoint, messages, options, true)),
        signal: AbortSignal.timeout(timeoutMs),
      },
      { trustedUrls: readTrustedEndpointUrls(), allowPrivateAddresses: endpoint.trusted },
    )
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new LlmRequestError(`模型请求超时（${Math.round(timeoutMs / 1000)} 秒）`)
    }

    throw new LlmRequestError(
      `模型请求失败：${error instanceof Error ? error.message : '网络错误'}`,
    )
  }

  if (!response.ok) {
    throw new LlmRequestError(`模型返回 ${response.status}：${await readErrorMessage(response)}`)
  }

  if (!response.body) {
    throw new LlmRequestError('模型没有返回可读取的流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  async function handleEvent(event: string) {
    const delta = readStreamDelta(event)

    if (delta) {
      fullText += delta
      await onDelta(delta)
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      await handleEvent(event)
    }
  }

  if (buffer.trim()) {
    await handleEvent(buffer)
  }

  return fullText
}
