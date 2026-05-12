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

export interface WordRequiredMeaning {
  partOfSpeech: string
  meaning: string
  priority: number
}

export interface WordGenerateData {
  word: string
  phonetic: string
  meanings: WordMeaningItem[]
  source: 'database' | 'generated' | 'system-cache'
  contentSource: 'dictionary' | 'agent'
  saved: boolean
}

export interface WordLookupData {
  word: string
  phonetic: string
  meanings: WordRequiredMeaning[]
}

export interface StoredWord {
  id: number
  word: string
  phonetic: string
  primaryMeaning: string
  meanings: WordMeaningItem[]
  ease: number
  interval: number
  nextReview: string
  reviewCount: number
  createdAt: string
  updatedAt: string
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface ReviewRollbackPayload {
  wordId: number
  ease: number
  interval: number
  nextReview: string
  reviewCount: number
}
