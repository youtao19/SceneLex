import { aiConfig } from '../config/ai'

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

// 用 schema 约束输出，减少小模型漏字段或乱改结构。
const jsonFormat = {
  type: 'object',
  properties: {
    word: { type: 'string' },
    phonetic: { type: 'string' },
    coreFeeling: { type: 'string' },
    meanings: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          partOfSpeech: { type: 'string' },
          meaning: { type: 'string' },
          sceneTitle: { type: 'string' },
          examples: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: { type: 'string' }
          },
          explanation: { type: 'string' },
          imageQueries: {
            type: 'array',
            minItems: 3,
            maxItems: 4,
            items: { type: 'string' }
          },
          tip: { type: 'string' }
        },
        required: ['partOfSpeech', 'meaning', 'sceneTitle', 'examples', 'explanation', 'imageQueries', 'tip']
      }
    }
  },
  required: ['word', 'phonetic', 'coreFeeling', 'meanings']
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
      format: jsonFormat,
      // 保留一段时间，避免频繁重载模型。
      keep_alive: '10m',
      options: {
        temperature: 0.6,
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
 * 调用 oMLX 的 OpenAI-compatible 接口。
 */
export async function generateWithOmlx(prompt: string): Promise<string> {
  const config = aiConfig.omlx
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a JSON API. Return only valid JSON. Do not include reasoning, markdown, or explanations.'
        },
        {
          role: 'user',
          content: `/no_think\n${prompt}`
        }
      ],
      // oMLX 走 OpenAI-compatible 协议，这里只要求 JSON object，不绑定某个厂商的 schema 扩展。
      response_format: {
        type: 'json_object'
      },
      chat_template_kwargs: {
        enable_thinking: false
      },
      temperature: 0.6,
      max_tokens: 800,
      stream: false
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`oMLX 调用失败：${response.status} ${errorText}`)
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
      throw new Error('DeepSeek 未返回完整 JSON，请调大 max_tokens 或缩短提示词')
    }

    return cleanContent
  }

  throw new Error('oMLX 未返回 message.content')
}

/**
 * 调用 DeepSeek 官方 OpenAI-compatible 接口。
 */
export async function generateWithDeepseek(prompt: string): Promise<string> {
  const config = aiConfig.deepseek

  if (!config.apiKey) {
    throw new Error('DeepSeek 调用失败：请先配置 DEEPSEEK_API_KEY')
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a JSON API. Return only valid JSON. Do not include reasoning, markdown, or explanations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: {
        type: 'json_object'
      },
      temperature: 0.6,
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
 * 根据 AI_PROVIDER 选择模型服务，业务层不需要知道具体部署方式。
 */
export async function generateWithLocalModel(prompt: string): Promise<string> {
  if (aiConfig.provider === 'omlx') {
    return generateWithOmlx(prompt)
  }

  if (aiConfig.provider === 'deepseek') {
    return generateWithDeepseek(prompt)
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
        num_predict: 220
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
 * oMLX 的阅读问答走普通 chat completion，避免被 JSON mode 约束。
 */
export async function generatePlainWithOmlx(prompt: string): Promise<string> {
  const config = aiConfig.omlx
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
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
          content: `/no_think\n${prompt}`
        }
      ],
      chat_template_kwargs: {
        enable_thinking: false
      },
      temperature: 0.3,
      max_tokens: 220,
      stream: false
    }),
    signal: AbortSignal.timeout(config.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`oMLX 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content

  if (content && content.trim()) {
    return cleanPlainText(content)
  }

  throw new Error('oMLX 未返回 message.content')
}

/**
 * DeepSeek 阅读问答不要求 JSON，避免短句翻译被强行包成对象。
 */
export async function generatePlainWithDeepseek(prompt: string): Promise<string> {
  const config = aiConfig.deepseek

  if (!config.apiKey) {
    throw new Error('DeepSeek 调用失败：请先配置 DEEPSEEK_API_KEY')
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
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
      max_tokens: 220,
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
 * 根据当前 AI_PROVIDER 生成普通文本，供阅读助手复用同一套模型切换配置。
 */
export async function generatePlainWithLocalModel(prompt: string): Promise<string> {
  if (aiConfig.provider === 'omlx') {
    return generatePlainWithOmlx(prompt)
  }

  if (aiConfig.provider === 'deepseek') {
    return generatePlainWithDeepseek(prompt)
  }

  return generatePlainWithOllama(prompt)
}
