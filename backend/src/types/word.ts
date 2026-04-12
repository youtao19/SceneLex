export interface WordMeaningItem {
  partOfSpeech: string;
  meaning: string;
  example: string;
  tip: string;
}

export interface WordGenerateResult {
  word: string;
  meanings: WordMeaningItem[];
}

export interface WordPayload {
  word: string;
}

export interface AddWordPayload extends WordPayload {
  meanings: WordMeaningItem[];
}

export type ReviewRating = 'again' | 'hard' | 'good';

export interface ReviewWordPayload {
  wordId: number;
  rating: ReviewRating;
}

export interface StoredWord {
  id: number;
  word: string;
  primaryMeaning: string;
  meanings: WordMeaningItem[];
  ease: number;
  interval: number;
  nextReview: string;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveWordResult {
  card: StoredWord;
  wasUpdated: boolean;
}

export interface WordRecord {
  word: string;
  scene: string;
  meanings: WordMeaningItem[];
}
