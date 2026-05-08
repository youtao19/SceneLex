import { aiConfig } from '../config/ai'
import { wordJsonFormat, wordJsonSystemPrompt } from '../prompts/word-output.prompt'

interface OllamaGenerateResponse {
  response: string
  thinking?: string
  done: boolean
  model: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      content?: string | null
    }
  }>
}

interface ChatCompletionStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
    }
  }>
}

type StreamDeltaHandler = (delta: string) => void | Promise<void>
const PLAIN_TEXT_MAX_TOKENS = 1600

export interface UserAiSecrets {
  kimi?: string
  deepseek?: string
  allowServerApiKey?: boolean
}

/**
 * 服务器环境变量里的 key 只允许管理员或后台任务兜底使用。
 */
function chooseApiKey(userApiKey: string | undefined, serverApiKey: string | undefined, secrets: UserAiSecrets) {
  if (userApiKey) {
    return userApiKey
  }

  return secrets.allowServerApiKey === false ? '' : (serverApiKey ?? '')
}

/**
 * 去掉模型常见的包裹符号，让阅读页拿到能直接展示的短文本。
 */
function cleanPlainText(text: string) {
  return text
    .trim()
    .replace(/^```(?:text|json)?/i, '')
    .replace(/```$/i, '')
    .trim()
    .replace(/^["“”]+|["“”]+$/g, '')
    .trim()
}

function hasWordMeanings(value: object) {
  return 'word' in value && 'meanings' in value
}

function findLastJsonObjectText(text: string) {
  const candidates: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }

      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = i
      }

      depth += 1
      continue
    }

    if (char === '}' && depth > 0) {
      depth -= 1

      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      const data = JSON.parse(candidates[i])

      if (data && typeof data === 'object' && hasWordMeanings(data)) {
        return candidates[i]
      }
    } catch {
      // 这里只是在筛选候选 JSON，解析失败说明它不是目标输出。
    }
  }

  return ''
}

/**
 * 调用 Ollama 生成单词义项和记忆提示。
 */
export async function generateWithOllama(prompt: string): Promise<string> {
  const config = aiConfig.ollama

  const response = await fetch(`${config.baseURL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      // Qwen3 在 Ollama 中默认会输出 thinking，关掉后 response 才稳定可解析。
      think: false,
      // 这里先关掉流式，后端逻辑更简单。
      stream: false,
      format: wordJsonFormat,
      // 保留一段时间，避免频繁重载模型。
      keep_alive: '10m',
      options: {
        temperature: 0.8,
        num_predict: 800
      }
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ollama 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as OllamaGenerateResponse

  if (data.response && data.response.trim()) {
    return data.response
  }

  // 少数情况下模型仍可能把正文放进 thinking，保底兼容一下。
  if (data.thinking && data.thinking.trim()) {
    return data.thinking
  }

  if (!data.response) {
    throw new Error('Ollama 未返回 response 字段')
  }

  throw new Error('Ollama 返回了空 response')
}

/**
 * 调用 Kimi 的 OpenAI-compatible 接口。
 */
export async function generateWithKimi(prompt: string, secrets: UserAiSecrets = {}): Promise<string> {
  const config = aiConfig.kimi
  const apiKey = chooseApiKey(secrets.kimi, config.apiKey, secrets)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (!apiKey) {
    throw new Error('Kimi 调用失败：请先在更多页面配置自己的 Kimi API Key')
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: wordJsonSystemPrompt
        },
        {
          role: 'user',
          content: `/no_think\n${prompt}`
        }
      ],
      // Kimi 走 OpenAI-compatible 协议，这里只要求 JSON object，不绑定某个厂商的 schema 扩展。
      response_format: {
        type: 'json_object'
      },
      thinking: {
        type: 'disabled'
      },
      temperature: 0.6,
      max_tokens: 2400,
      stream: false
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Kimi 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content

  if (content && content.trim()) {
    const cleanContent = content.trim()
    const jsonText = findLastJsonObjectText(cleanContent)

    if (jsonText) {
      return jsonText
    }

    if (cleanContent.startsWith('{')) {
      throw new Error('Kimi 未返回完整 JSON，请调大 max_tokens 或缩短提示词')
    }

    return cleanContent
  }

  throw new Error('Kimi 未返回 message.content')
}

/**
 * 调用 DeepSeek 官方 OpenAI-compatible 接口。
 */
export async function generateWithDeepseek(prompt: string, secrets: UserAiSecrets = {}): Promise<string> {
  const config = aiConfig.deepseek
  const apiKey = chooseApiKey(secrets.deepseek, config.apiKey, secrets)

  if (!apiKey) {
    throw new Error('DeepSeek 调用失败：请先在更多页面配置自己的 DeepSeek API Key')
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: wordJsonSystemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: {
        type: 'json_object'
      },
      temperature: 0.8,
      max_tokens: 2400,
      stream: false
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepSeek 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as ChatCompletionResponse
  const finishReason = data.choices?.[0]?.finish_reason
  const content = data.choices?.[0]?.message?.content

  if (finishReason === 'length') {
    throw new Error('DeepSeek 输出被 max_tokens 截断，请调大 max_tokens 或缩短提示词')
  }

  if (content && content.trim()) {
    const cleanContent = content.trim()
    const jsonText = findLastJsonObjectText(cleanContent)

    return jsonText || cleanContent
  }

  throw new Error('DeepSeek 未返回 message.content')
}

/**
 * OpenAI-compatible stream 用 SSE 包装 JSON，这里只抽出正文增量。
 */
async function readChatCompletionStream(response: Response, onDelta: StreamDeltaHandler) {
  if (!response.body) {
    throw new Error('模型没有返回可读取的流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  /**
   * 一个 SSE event 可能包含多行 data，先拼成完整 JSON 再读 delta。
   */
  async function readEvent(event: string) {
    const payload = event
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')

    if (!payload || payload === '[DONE]') {
      return
    }

    const data = JSON.parse(payload) as ChatCompletionStreamChunk
    const delta = data.choices?.[0]?.delta?.content ?? ''

    if (delta) {
      fullText += delta
      await onDelta(delta)
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      await readEvent(event)
    }
  }

  if (buffer.trim()) {
    await readEvent(buffer)
  }

  return cleanPlainText(fullText)
}

/**
 * Ollama generate stream 是逐行 JSON，不是 SSE。
 */
async function readOllamaGenerateStream(response: Response, onDelta: StreamDeltaHandler) {
  if (!response.body) {
    throw new Error('Ollama 没有返回可读取的流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const payload = line.trim()

      if (!payload) {
        continue
      }

      const data = JSON.parse(payload) as OllamaGenerateResponse
      const delta = data.response || data.thinking || ''

      if (delta) {
        fullText += delta
        await onDelta(delta)
      }
    }
  }

  if (buffer.trim()) {
    const data = JSON.parse(buffer.trim()) as OllamaGenerateResponse
    const delta = data.response || data.thinking || ''

    if (delta) {
      fullText += delta
      await onDelta(delta)
    }
  }

  return cleanPlainText(fullText)
}

/**
 * 根据 AI_PROVIDER 选择模型服务，业务层不需要知道具体部署方式。
 */
export async function generateWithLocalModel(prompt: string, secrets: UserAiSecrets = {}): Promise<string> {
  if (aiConfig.provider === 'kimi') {
    return generateWithKimi(prompt, secrets)
  }

  if (aiConfig.provider === 'deepseek') {
    return generateWithDeepseek(prompt, secrets)
  }

  return generateWithOllama(prompt)
}

/**
 * 阅读助手需要自然语言短回答，不能复用词卡生成的 JSON schema。
 */
export async function generatePlainWithOllama(prompt: string): Promise<string> {
  const config = aiConfig.ollama

  const response = await fetch(`${config.baseURL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      think: false,
      stream: false,
      keep_alive: '10m',
      options: {
        temperature: 0.3,
        num_predict: PLAIN_TEXT_MAX_TOKENS
      }
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ollama 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as OllamaGenerateResponse
  const text = data.response || data.thinking || ''

  if (text.trim()) {
    return cleanPlainText(text)
  }

  throw new Error('Ollama 返回了空 response')
}

/**
 * Ollama 原生支持流式 generate，阅读助手可以边生成边展示。
 */
export async function streamPlainWithOllama(prompt: string, onDelta: StreamDeltaHandler): Promise<string> {
  const config = aiConfig.ollama

  const response = await fetch(`${config.baseURL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      think: false,
      stream: true,
      keep_alive: '10m',
      options: {
        temperature: 0.3,
        num_predict: PLAIN_TEXT_MAX_TOKENS
      }
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ollama 调用失败：${response.status} ${errorText}`)
  }

  const text = await readOllamaGenerateStream(response, onDelta)

  if (text.trim()) {
    return text
  }

  throw new Error('Ollama 返回了空 response')
}

/**
 * Kimi 的阅读问答走普通 chat completion，避免被 JSON mode 约束。
 */
export async function generatePlainWithKimi(prompt: string, secrets: UserAiSecrets = {}): Promise<string> {
  const config = aiConfig.kimi
  const apiKey = chooseApiKey(secrets.kimi, config.apiKey, secrets)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (!apiKey) {
    throw new Error('Kimi 调用失败：请先在更多页面配置自己的 Kimi API Key')
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a concise bilingual English-Chinese reading teacher. Answer in Chinese unless asked otherwise.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      thinking: {
        type: 'disabled'
      },
      temperature: 0.6,
      max_tokens: PLAIN_TEXT_MAX_TOKENS,
      stream: false
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Kimi 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content

  if (content && content.trim()) {
    return cleanPlainText(content)
  }

  throw new Error('Kimi 未返回 message.content')
}

/**
 * Kimi 兼容 OpenAI chat completions，能用 SSE 增量读取。
 */
export async function streamPlainWithKimi(
  prompt: string,
  onDelta: StreamDeltaHandler,
  secrets: UserAiSecrets = {},
): Promise<string> {
  const config = aiConfig.kimi
  const apiKey = chooseApiKey(secrets.kimi, config.apiKey, secrets)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (!apiKey) {
    throw new Error('Kimi 调用失败：请先在更多页面配置自己的 Kimi API Key')
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a concise bilingual English-Chinese reading teacher. Answer in Chinese unless asked otherwise.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      thinking: {
        type: 'disabled'
      },
      temperature: 0.6,
      max_tokens: PLAIN_TEXT_MAX_TOKENS,
      stream: true
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Kimi 调用失败：${response.status} ${errorText}`)
  }

  const text = await readChatCompletionStream(response, onDelta)

  if (text.trim()) {
    return text
  }

  throw new Error('Kimi 未返回 message.content')
}

/**
 * DeepSeek 阅读问答不要求 JSON，避免短句翻译被强行包成对象。
 */
export async function generatePlainWithDeepseek(prompt: string, secrets: UserAiSecrets = {}): Promise<string> {
  const config = aiConfig.deepseek
  const apiKey = chooseApiKey(secrets.deepseek, config.apiKey, secrets)

  if (!apiKey) {
    throw new Error('DeepSeek 调用失败：请先在更多页面配置自己的 DeepSeek API Key')
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a concise bilingual English-Chinese reading teacher. Answer in Chinese unless asked otherwise.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: PLAIN_TEXT_MAX_TOKENS,
      stream: false
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepSeek 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as ChatCompletionResponse
  const finishReason = data.choices?.[0]?.finish_reason
  const content = data.choices?.[0]?.message?.content

  if (finishReason === 'length') {
    throw new Error('DeepSeek 输出被 max_tokens 截断，请调大 max_tokens 或缩短文本')
  }

  if (content && content.trim()) {
    return cleanPlainText(content)
  }

  throw new Error('DeepSeek 未返回 message.content')
}

/**
 * DeepSeek 使用 OpenAI-compatible SSE，前端能看到实时 token。
 */
export async function streamPlainWithDeepseek(
  prompt: string,
  onDelta: StreamDeltaHandler,
  secrets: UserAiSecrets = {},
): Promise<string> {
  const config = aiConfig.deepseek
  const apiKey = chooseApiKey(secrets.deepseek, config.apiKey, secrets)

  if (!apiKey) {
    throw new Error('DeepSeek 调用失败：请先在更多页面配置自己的 DeepSeek API Key')
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a concise bilingual English-Chinese reading teacher. Answer in Chinese unless asked otherwise.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: PLAIN_TEXT_MAX_TOKENS,
      stream: true
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepSeek 调用失败：${response.status} ${errorText}`)
  }

  const text = await readChatCompletionStream(response, onDelta)

  if (text.trim()) {
    return text
  }

  throw new Error('DeepSeek 未返回 message.content')
}

/**
 * 根据当前 AI_PROVIDER 生成普通文本，供阅读助手复用同一套模型切换配置。
 */
export async function generatePlainWithLocalModel(
  prompt: string,
  secrets: UserAiSecrets = {},
): Promise<string> {
  if (aiConfig.provider === 'kimi') {
    return generatePlainWithKimi(prompt, secrets)
  }

  if (aiConfig.provider === 'deepseek') {
    return generatePlainWithDeepseek(prompt, secrets)
  }

  return generatePlainWithOllama(prompt)
}

/**
 * 阅读助手的流式入口，保持 provider 切换逻辑只在 LLM 层出现一次。
 */
export async function streamPlainWithLocalModel(
  prompt: string,
  onDelta: StreamDeltaHandler,
  secrets: UserAiSecrets = {},
): Promise<string> {
  if (aiConfig.provider === 'kimi') {
    return streamPlainWithKimi(prompt, onDelta, secrets)
  }

  if (aiConfig.provider === 'deepseek') {
    return streamPlainWithDeepseek(prompt, onDelta, secrets)
  }

  return streamPlainWithOllama(prompt, onDelta)
}
