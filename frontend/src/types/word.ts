export interface WordMeaningItem {
  partOfSpeech: string
  meaning: string
  sceneTitle: string
  examples: string[]
  explanation: string
  imageQueries: string[]
  example: string
  tip: string
}

export interface WordGenerateData {
  word: string
  phonetic: string
  coreFeeling: string
  meanings: WordMeaningItem[]
  source: 'database' | 'generated'
  contentSource: 'dictionary' | 'agent'
  saved: boolean
}

export interface StoredWord {
  id: number
  word: string
  phonetic: string
  primaryMeaning: string
  coreFeeling: string
  meanings: WordMeaningItem[]
  ease: number
  interval: number
  nextReview: string
  reviewCount: number
  createdAt: string
  updatedAt: string
}

export type ReviewRating = 'again' | 'hard' | 'good'
