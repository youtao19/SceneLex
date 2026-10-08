import { wordJsonSystemPrompt } from '../prompts/word-output.prompt'
import {
  buildVisionMessage,
  chatCompletion,
  chatCompletionStream,
  LlmRequestError,
  type ChatMessage,
  type StreamDeltaHandler,
} from './llm-client'
import type { AiEndpoint } from '../types/endpoint'

/**
 * 业务层只描述「要什么」，具体请求形态全部由 llm-client 决定。
 *
 * 这里刻意不再按 provider 分支：端点由用户自己填，协议统一是
 * OpenAI-compatible 的 /v1/chat/completions。
 */

export { LlmRequestError }

const PLAIN_TEXT_MAX_TOKENS = 1600
const WORD_JSON_MAX_TOKENS = 2400

const PLAIN_TEXT_SYSTEM_PROMPT =
  'You are a concise bilingual English-Chinese reading teacher. Answer in Chinese unless asked otherwise.'

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

/**
 * 模型偶尔会在 JSON 前后带解释文字，这里从后往前找最后一个合法的词卡对象。
 */
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
 * 词卡生成：要求 JSON object，并容忍模型在 JSON 前后带解释。
 */
export async function generateWordJson(endpoint: AiEndpoint, prompt: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: wordJsonSystemPrompt },
    { role: 'user', content: prompt },
  ]

  const { content, finishReason } = await chatCompletion(endpoint, messages, {
    json: true,
    maxTokens: WORD_JSON_MAX_TOKENS,
    temperature: 0.8,
  })

  const jsonText = findLastJsonObjectText(content)

  if (jsonText) {
    return jsonText
  }

  if (finishReason === 'length' || content.startsWith('{')) {
    throw new Error('模型未返回完整 JSON，请调大 max_tokens 或缩短提示词')
  }

  return content
}

/**
 * 阅读问答要自然语言短回答，不能复用词卡的 JSON 约束。
 */
export async function generatePlainText(endpoint: AiEndpoint, prompt: string): Promise<string> {
  const { content } = await chatCompletion(
    endpoint,
    [
      { role: 'system', content: PLAIN_TEXT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    { maxTokens: PLAIN_TEXT_MAX_TOKENS, temperature: 0.3 },
  )

  return cleanPlainText(content)
}

/**
 * 阅读助手边生成边展示，避免用户等整段结束。
 */
export async function streamPlainText(
  endpoint: AiEndpoint,
  prompt: string,
  onDelta: StreamDeltaHandler,
): Promise<string> {
  const text = await chatCompletionStream(
    endpoint,
    [
      { role: 'system', content: PLAIN_TEXT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    onDelta,
    { maxTokens: PLAIN_TEXT_MAX_TOKENS, temperature: 0.3 },
  )

  return cleanPlainText(text)
}

/**
 * 视觉 OCR。图片走 base64 data URL，这是唯一同时适配 Ollama 和云端服务的写法。
 */
export async function extractTextFromImage(
  endpoint: AiEndpoint,
  prompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const { content } = await chatCompletion(
    endpoint,
    [
      { role: 'system', content: 'You are an OCR engine. Return only the text extracted from the image.' },
      buildVisionMessage(prompt, imageBase64, mimeType),
    ],
    { maxTokens: 1800, temperature: 0 },
  )

  return cleanPlainText(content)
}
