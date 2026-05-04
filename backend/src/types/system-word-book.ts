import type { WordRequiredMeaning } from './word';

export interface SystemWordBook {
  id: number;
  code: string;
  name: string;
  description: string;
  totalWords: number;
  learnedWords: number;
  createdAt: string;
  updatedAt: string;
}

export interface SystemWordBookItem {
  id: number;
  bookId: number;
  word: string;
  orderIndex: number;
  unit: string;
  difficulty: string;
  examMeanings: WordRequiredMeaning[];
  learned: boolean;
}

export interface SystemWordBookDetail extends SystemWordBook {
  nextWords: SystemWordBookItem[];
}
