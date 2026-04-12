import { buildWordPrompt } from '../prompts/word.prompt'
import { generateWithOllama } from './llm.service'

export interface WordMeaningItem {
  partOfSpeech: string
  meaning: string
  example: string
  tip: string
}

export interface WordGenerateResult {
  word: string
  meanings: WordMeaningItem[]
}

/**
 * 模型不可用时至少返回一组可读内容，避免页面完全空白。
 */
function buildFallback(word: string): WordGenerateResult {
  return {
    word,
    meanings: [
      {
        partOfSpeech: '词性',
        meaning: '常见意思',
        example: `I met the word ${word} in a short sentence.`,
        tip: `${word} 的使用场景`
      }
    ]
  }
}

/**
 * 读取新结构 meanings，保留义项之间的一一对应关系。
 */
function readMeaningItems(value: unknown): WordMeaningItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: WordMeaningItem[] = []

  for (let i = 0; i < value.length; i += 1) {
    const item = value[i]

    if (!item || typeof item !== 'object') {
      continue
    }

    const data = item as Record<string, unknown>
    const partOfSpeech =
      typeof data.partOfSpeech === 'string' ? data.partOfSpeech.trim() : ''
    const meaning = typeof data.meaning === 'string' ? data.meaning.trim() : ''
    const example = typeof data.example === 'string' ? data.example.trim() : ''
    const tip = typeof data.tip === 'string' ? data.tip.trim() : ''

    if (!partOfSpeech || !meaning || !example || !tip) {
      continue
    }

    result.push({
      partOfSpeech,
      meaning,
      example,
      tip
    })
  }

  return result
}

/**
 * 兼容旧结构 examples/tips，避免模型偶尔没跟上新 prompt 时直接失败。
 */
function readLegacyMeaningItems(raw: Record<string, unknown>): WordMeaningItem[] {
  const examples = Array.isArray(raw.examples) ? raw.examples : []
  const tips = Array.isArray(raw.tips) ? raw.tips : []
  const count = Math.min(examples.length, tips.length)
  const result: WordMeaningItem[] = []

  for (let i = 0; i < count; i += 1) {
    const example = typeof examples[i] === 'string' ? examples[i].trim() : ''
    const tip = typeof tips[i] === 'string' ? tips[i].trim() : ''

    if (!example || !tip) {
      continue
    }

    result.push({
      partOfSpeech: '词性',
      meaning: `义项 ${result.length + 1}`,
      example,
      tip
    })
  }

  return result
}

/**
 * 标准化模型结果，优先保留合法数据，其次回退到兜底内容。
 */
function normalizeResult(raw: unknown, fallbackWord: string): WordGenerateResult {
  const fallback = buildFallback(fallbackWord)
  let word = fallbackWord
  let meanings = fallback.meanings

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    const rawWord = data.word

    if (typeof rawWord === 'string') {
      const cleanWord = rawWord.trim()

      if (cleanWord) {
        word = cleanWord
      }
    }

    const meaningItems = readMeaningItems(data.meanings)

    if (meaningItems.length > 0) {
      meanings = meaningItems
    } else {
      const legacyItems = readLegacyMeaningItems(data)

      if (legacyItems.length > 0) {
        meanings = legacyItems
      }
    }
  }

  return {
    word,
    meanings
  }
}

export const wordService = {
  /**
   * 生成按义项分组的标准释义、典型短语和简短联想。
   */
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
