import { del, get, post } from './http'
import type { ApiResponse } from '../types/api'
import type {
  ReadingArticle,
  ReadingSentenceTranslateData,
  ReadingWordLookupData
} from '../types/reading'

export function fetchReadingArticles() {
  return get<ApiResponse<ReadingArticle[]>>('/reading/articles')
}

export function saveReadingArticle(content: string) {
  return post<ApiResponse<ReadingArticle>>('/reading/articles', { content })
}

export function deleteReadingArticle(articleId: number) {
  return del<ApiResponse<null>>(`/reading/articles/${articleId}`)
}

/**
 * 单词查询带上句子上下文，避免多义词脱离语境。
 */
export function lookupReadingWord(word: string, sentence: string) {
  return post<ApiResponse<ReadingWordLookupData>>('/reading/word', { word, sentence })
}

/**
 * 阅读页按需翻译单句，后端只返回最终中文。
 */
export function translateReadingSentence(sentence: string) {
  return post<ApiResponse<ReadingSentenceTranslateData>>('/reading/sentence', { sentence })
}
