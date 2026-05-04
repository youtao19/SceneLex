import { generatePlainWithLocalModel } from './llm.service'
import { HttpError } from '../utils/http-error'
import type {
  ReadingSentenceTranslateResult,
  ReadingWordLookupResult
} from '../types/reading'

/**
 * 阅读接口限制单次输入长度，避免本地模型被整篇文章请求拖住。
 */
function normalizeInput(value: string, fieldName: string, maxLength: number) {
  const text = value.trim()

  if (!text) {
    throw new HttpError(400, `${fieldName} 不能为空`)
  }

  if (text.length > maxLength) {
    throw new HttpError(400, `${fieldName} 太长，请缩短后重试`)
  }

  return text
}

/**
 * 单词释义 prompt 保持短输出，底部面板才能快速给反馈。
 */
function buildWordPrompt(word: string, sentence: string) {
  return `你是中英双语英语阅读老师。请根据上下文解释英文单词。

单词：${word}
上下文句子：${sentence}

要求：
- 输出中文，最多 2 行
- 如果能判断词性，格式为 "[词性] 中文释义"
- 可以补一个很短的语境说明
- 不要输出 Markdown、引号或多余解释`
}

/**
 * 整句翻译 prompt 只要译文，避免阅读区混入解释文本。
 */
function buildSentencePrompt(sentence: string) {
  return `请把下面英文句子翻译成自然、流畅的中文。

要求：
- 只输出最终中文译文
- 不要解释
- 不要加引号

英文句子：${sentence}`
}

export const readingService = {
  /**
   * 单词查询必须带句子上下文，否则多义词会给出错误义项。
   */
  async lookupWord(word: string, sentence: string): Promise<ReadingWordLookupResult> {
    const cleanWord = normalizeInput(word, 'word', 80)
    const cleanSentence = normalizeInput(sentence, 'sentence', 600)
    const text = await generatePlainWithLocalModel(buildWordPrompt(cleanWord, cleanSentence))

    return { text }
  },

  /**
   * 整句翻译只处理短句，长文章仍交给前端逐句触发，避免一次请求拖垮本地模型。
   */
  async translateSentence(sentence: string): Promise<ReadingSentenceTranslateResult> {
    const cleanSentence = normalizeInput(sentence, 'sentence', 800)
    const text = await generatePlainWithLocalModel(buildSentencePrompt(cleanSentence))

    return { text }
  }
}
