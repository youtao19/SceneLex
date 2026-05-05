import { get, post } from './http'
import type { ApiResponse } from '../types/api'
import type {
  ReviewRating,
  StoredWord,
  WordGenerateData,
  WordMeaningItem,
  WordRequiredMeaning,
} from '../types/word'

export async function generateWord(
  word: string,
  forceRegenerate = false,
  requiredMeanings: WordRequiredMeaning[] = []
) {
  return post<ApiResponse<WordGenerateData>>('/words/generate', {
    word,
    forceRegenerate,
    requiredMeanings,
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
