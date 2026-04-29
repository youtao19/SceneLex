import type { StoredWord } from './word'

export interface WordBook {
  id: number
  name: string
  isDefault: boolean
  wordCount: number
  createdAt: string
  updatedAt: string
}

export interface WordBookDetail extends WordBook {
  words: StoredWord[]
}
