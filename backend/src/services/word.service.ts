import { buildWordPrompt } from '../prompts/word.prompt'
import { generateWithOllama } from './llm.service'

export interface WordGenerateResult {
  word: string
  examples: string[]
  tips: string[]
}

function buildFallback(word: string): WordGenerateResult {
  const examples = [
    `This is a simple example with ${word}.`,
    `I am learning the word ${word} today.`,
    `${word} appears in a short scene here.`
  ]

  const tips = [
    `${word}：先建立基础印象`,
    `把 ${word} 放进短场景里记`,
    `重复看几次 ${word} 的用法`
  ]

  return {
    word,
    examples,
    tips
  }
}

function readStringList(value: unknown): string[] {
  const result: string[] = []

  if (!Array.isArray(value)) {
    return result
  }

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i]

    if (typeof item !== 'string') {
      continue
    }

    const text = item.trim()

    if (!text) {
      continue
    }

    result.push(text)

    // 只取前 3 条，和接口约定保持一致。
    if (result.length === 3) {
      break
    }
  }

  return result
}

function normalizeResult(raw: unknown, fallbackWord: string): WordGenerateResult {
  const fallback = buildFallback(fallbackWord)
  let word = fallbackWord
  let examples = fallback.examples
  let tips = fallback.tips

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    const rawWord = data.word
    const rawExamples = data.examples
    const rawTips = data.tips

    if (typeof rawWord === 'string') {
      const cleanWord = rawWord.trim()

      if (cleanWord) {
        word = cleanWord
      }
    }

    const exampleList = readStringList(rawExamples)

    if (exampleList.length === 3) {
      examples = exampleList
    }

    const tipList = readStringList(rawTips)

    if (tipList.length === 3) {
      tips = tipList
    }
  }

  return {
    word,
    examples,
    tips
  }
}

export const wordService = {
  async generateWordContent(word: string): Promise<WordGenerateResult> {
    const cleanWord = word.trim().toLowerCase()
    const prompt = buildWordPrompt(cleanWord)
    const rawText = await generateWithOllama(prompt)

    try {
      const parsed = JSON.parse(rawText)
      const result = normalizeResult(parsed, cleanWord)
      return result
    } catch {
      // 小模型偶尔会吐出非 JSON 文本，这里直接报错给上层处理。
      console.error('模型返回非 JSON：', rawText)
      throw new Error('模型输出解析失败')
    }
  }
}
