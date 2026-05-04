export interface WordMeaningItem {
  partOfSpeech: string;
  meaning: string;
  sceneTitle: string;
  examples: string[];
  explanation: string;
  imageQueries: string[];
  example: string;
  tip: string;
}

export interface WordRequiredMeaning {
  partOfSpeech: string;
  meaning: string;
  priority: number;
}

export interface WordGenerateResult {
  word: string;
  phonetic: string;
  coreFeeling: string;
  meanings: WordMeaningItem[];
  source: 'database' | 'generated';
  contentSource: 'dictionary' | 'agent';
  saved: boolean;
}

export interface WordPayload {
  word: string;
}

export interface AddWordPayload extends WordPayload {
  phonetic?: string;
  coreFeeling?: string;
  meanings: WordMeaningItem[];
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewWordPayload {
  wordId: number;
  rating: ReviewRating;
}

export interface StoredWord {
  id: number;
  word: string;
  phonetic: string;
  primaryMeaning: string;
  coreFeeling: string;
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
