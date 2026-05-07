import { get, post } from './http'
import type { ApiResponse } from '../types/api'
import type {
  ReviewRating,
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

export async function reviewWord(wordId: number, rating: ReviewRating) {
  return post<ApiResponse<StoredWord>>('/word/review', { wordId, rating })
}
