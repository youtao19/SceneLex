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

// 用 schema 约束输出，减少小模型漏字段或乱改结构。
const jsonFormat = {
  type: 'object',
  properties: {
    word: { type: 'string' },
    meanings: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          partOfSpeech: { type: 'string' },
          meaning: { type: 'string' },
          example: { type: 'string' },
          tip: { type: 'string' }
        },
        required: ['partOfSpeech', 'meaning', 'example', 'tip']
      }
    }
  },
  required: ['word', 'meanings']
}

/**
 * 调用 Ollama 生成单词义项和记忆提示。
 */
export async function generateWithOllama(prompt: string): Promise<string> {
  const response = await fetch(`${aiConfig.baseURL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: aiConfig.model,
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
        num_predict: 320
      }
    }),
    signal: AbortSignal.timeout(aiConfig.timeout)
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
