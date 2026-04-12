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

export interface StoredWord {
  id: number
  word: string
  primaryMeaning: string
  meanings: WordMeaningItem[]
  ease: number
  interval: number
  nextReview: string
  reviewCount: number
  createdAt: string
  updatedAt: string
}

export type ReviewRating = 'again' | 'hard' | 'good'
