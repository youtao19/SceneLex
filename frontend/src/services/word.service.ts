import { post } from './http'
import type { ApiResponse, WordGenerateData } from '../types/word'

export async function generateWord(word: string) {
  return post<ApiResponse<WordGenerateData>>('/words/generate', { word })
}
