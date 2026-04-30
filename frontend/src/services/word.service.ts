import { get, post } from './http'
import type { ApiResponse } from '../types/api'
import type {
  ReviewRating,
  StoredWord,
  WordGenerateData,
  WordMeaningItem,
} from '../types/word'

export async function generateWord(word: string, forceRegenerate = false) {
  return post<ApiResponse<WordGenerateData>>('/words/generate', {
    word,
    forceRegenerate,
  })
}

export async function addWord(
  word: string,
  phonetic: string,
  coreFeeling: string,
  meanings: WordMeaningItem[],
  bookIds: number[] = []
) {
  return post<ApiResponse<StoredWord>>('/word/add', { word, phonetic, coreFeeling, meanings, bookIds })
}

export async function getTodayWords() {
  return get<ApiResponse<StoredWord[]>>('/word/today')
}

export async function reviewWord(wordId: number, rating: ReviewRating) {
  return post<ApiResponse<StoredWord>>('/word/review', { wordId, rating })
}
