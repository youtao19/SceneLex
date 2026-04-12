import { aiConfig } from '../config/ai'

interface OllamaGenerateResponse {
  response: string
  done: boolean
  model: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

// 用 schema 约束输出，尽量让小模型稳定返回固定结构。
const jsonFormat = {
  type: 'object',
  properties: {
    word: { type: 'string' },
    examples: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3
    },
    tips: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3
    }
  },
  required: ['word', 'examples', 'tips']
}

export async function generateWithOllama(prompt: string): Promise<string> {
  const response = await fetch(`${aiConfig.baseURL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: aiConfig.model,
      prompt,
      // 这里先关掉流式，后端逻辑更简单。
      stream: false,
      format: jsonFormat,
      // 保留一段时间，避免频繁重载模型。
      keep_alive: '10m',
      options: {
        temperature: 0.6,
        num_predict: 220
      }
    }),
    signal: AbortSignal.timeout(aiConfig.timeout)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Ollama 调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as OllamaGenerateResponse

  if (!data.response) {
    throw new Error('Ollama 未返回 response 字段')
  }

  // Ollama 把正文放在 response 字段里。
  return data.response
}
