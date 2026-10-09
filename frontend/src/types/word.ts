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
  /** 每次排期写入 +1；评分时回传，服务端据此发现另一端已经改过。 */
  studyVersion: number
  /** 首次完成新词的时间；null 表示还没完成过。 */
  firstLearnedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

/**
 * 撤销只带服务端记录的操作引用：旧版那套排期快照会覆盖另一端的新进度，已经不用了。
 */
export interface ReviewRollbackPayload {
  wordId: number
  targetOperationId: string
  operationId?: string
}
