export interface WordGenerateData {
  word: string
  examples: string[]
  tips: string[]
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}
