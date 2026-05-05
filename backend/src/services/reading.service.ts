import { generatePlainWithLocalModel, streamPlainWithLocalModel } from './llm.service'
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

/**
 * 阅读助手 prompt，包含文章背景，让 AI 回答更有针对性。
 */
function buildChatPrompt(
  content: string,
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
) {
  const historyText = history.length > 0
    ? history.map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n')
    : '暂无'

  return `你是一个英语阅读助手。用户正在阅读下面的英语文章。请根据文章内容回答用户的问题。

文章内容：
"""
${content}
"""

最近对话：
${historyText}

用户问题：${question}

要求：
- 使用中文回答
- 回答要简练、准确，针对文章内容
- 可以解释文章里的难句、生词或背景知识
- 不要输出 Markdown 标记或多余的客套话`
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
  },

  /**
   * 阅读助手对话接口。
   */
  async chat(content: string, question: string): Promise<{ text: string }> {
    const cleanContent = normalizeInput(content, 'content', 10000)
    const cleanQuestion = normalizeInput(question, 'question', 1000)
    const text = await generatePlainWithLocalModel(buildChatPrompt(cleanContent, cleanQuestion))

    return { text }
  },

  /**
   * 带最近对话历史的阅读助手接口，用于历史聊天继续追问。
   */
  async chatWithHistory(
    content: string,
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ text: string }> {
    const cleanContent = normalizeInput(content, 'content', 10000)
    const cleanQuestion = normalizeInput(question, 'question', 1000)
    const text = await generatePlainWithLocalModel(buildChatPrompt(cleanContent, cleanQuestion, history))

    return { text }
  },

  /**
   * 流式回答复用同一个 prompt，避免普通接口和流式接口回答风格分叉。
   */
  async chatWithHistoryStream(
    content: string,
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    onDelta: (delta: string) => void | Promise<void>,
  ): Promise<{ text: string }> {
    const cleanContent = normalizeInput(content, 'content', 10000)
    const cleanQuestion = normalizeInput(question, 'question', 1000)
    const text = await streamPlainWithLocalModel(
      buildChatPrompt(cleanContent, cleanQuestion, history),
      onDelta,
    )

    return { text }
  }
}
