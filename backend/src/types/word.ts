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
  meanings: WordMeaningItem[];
  source: 'database' | 'generated' | 'system-cache';
  contentSource: 'dictionary' | 'agent';
  saved: boolean;
}

export interface WordLookupResult {
  word: string;
  phonetic: string;
  meanings: WordRequiredMeaning[];
}

export interface WordPayload {
  word: string;
}

export interface AddWordPayload extends WordPayload {
  phonetic?: string;
  meanings: WordMeaningItem[];
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewWordPayload {
  wordId: number;
  rating: ReviewRating;
  /** 客户端稳定操作 ID：重试复用同一个值，服务端据此去重。旧网页不传。 */
  operationId?: string;
  /** 客户端看到的记录版本；不一致说明另一端已改过。旧网页不传。 */
  expectedVersion?: number;
}

/**
 * 撤销只认服务端记录的操作引用，不再接受客户端排期快照 ——
 * 信任快照会用旧进度覆盖另一端的新进度。
 */
export interface ReviewRollbackPayload {
  wordId: number;
  targetOperationId?: string;
  operationId?: string;
}

/**
 * 移动端“完成新词”：保存词卡、首次评分和当日计数在同一事务里完成，
 * 只查看或生成预览不算完成。
 */
export interface CompleteNewWordPayload {
  word: string;
  phonetic?: string;
  meanings: WordMeaningItem[];
  rating: ReviewRating;
  bookIds?: number[];
  operationId?: string;
}

/** 评分前的排期快照；教学内容与词书归属不参与回滚。 */
export interface ReviewSnapshot {
  ease: number;
  interval: number;
  nextReview: string;
  reviewCount: number;
  firstLearnedAt: string | null;
}

export interface StudyOverview {
  learningDay: string;
  newWordTarget: number;
  newWordCompleted: number;
  currentSystemBookId: number | null;
  currentSystemBookName: string | null;
  dueTotal: number;
  queueCount: number;
  dailyReviewLimitEnabled: boolean;
  dailyReviewLimit: number;
}

export interface NewWordCandidate {
  itemId: number;
  word: string;
  orderIndex: number;
  unit: string;
  examMeanings: WordRequiredMeaning[];
}

export interface NewWordQueue {
  bookId: number | null;
  bookName: string | null;
  learningDay: string;
  newWordTarget: number;
  newWordCompleted: number;
  remainingTarget: number;
  words: NewWordCandidate[];
}

export interface StoredWord {
  id: number;
  word: string;
  phonetic: string;
  primaryMeaning: string;
  meanings: WordMeaningItem[];
  ease: number;
  interval: number;
  nextReview: string;
  reviewCount: number;
  /** 每次排期写入 +1；双端冲突检测用，不参与教学展示。 */
  studyVersion: number;
  /** 首次完成时间；null 表示还没完成过新词学习，撤销首次完成会把它置回 null。 */
  firstLearnedAt: string | null;
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
