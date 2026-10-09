import { get, post } from './http'
import type { ApiResponse } from '../types/api'
import type {
  ReviewRating,
  ReviewRollbackPayload,
  StoredWord,
  WordGenerateData,
  WordLookupData,
  WordMeaningItem,
  WordRequiredMeaning,
} from '../types/word'

export async function lookupWord(word: string) {
  return post<ApiResponse<WordLookupData>>('/words/lookup', { word })
}

export async function generateWord(
  word: string,
  forceRegenerate = false,
  requiredMeanings: WordRequiredMeaning[] = [],
  systemBookItemId?: number
) {
  return post<ApiResponse<WordGenerateData>>('/words/generate', {
    word,
    forceRegenerate,
    requiredMeanings,
    systemBookItemId,
  })
}

export async function addWord(
  word: string,
  phonetic: string,
  meanings: WordMeaningItem[],
  bookIds: number[] = []
) {
  return post<ApiResponse<StoredWord>>('/word/add', { word, phonetic, meanings, bookIds })
}

export async function getTodayWords() {
  return get<ApiResponse<StoredWord[]>>('/word/today')
}

/**
 * 评分带上操作 ID 和看到的版本：重试不会重复推进排期，
 * 另一端改过时服务端返回 409，页面刷新而不是覆盖新进度。
 */
export async function reviewWord(
  wordId: number,
  rating: ReviewRating,
  operationId: string,
  expectedVersion?: number
) {
  return post<ApiResponse<StoredWord>>('/word/review', {
    wordId,
    rating,
    operationId,
    expectedVersion,
  })
}

export async function rollbackReviewWord(payload: ReviewRollbackPayload) {
  return post<ApiResponse<StoredWord>>('/word/review/rollback', payload)
}
