import type { StoredWord } from '../types/word';

export interface HistorySummary {
  totalWords: number;
  dueToday: number;
  reviewedWords: number;
}

export interface HistoryArchive {
  summary: HistorySummary;
  dueWords: StoredWord[];
  recentWords: StoredWord[];
  words: StoredWord[];
}
