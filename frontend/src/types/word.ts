export interface WordMeaningItem {
  partOfSpeech: string
  meaning: string
  example: string
  tip: string
}

export interface WordGenerateData {
  word: string
  meanings: WordMeaningItem[]
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}
