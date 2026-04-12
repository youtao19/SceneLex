import { defineStore } from 'pinia';
import type { WordMeaningItem } from '../types/word';

export const useWordStore = defineStore('word', {
  state: () => ({
    currentWord: '',
    scene: '',
    meanings: [] as WordMeaningItem[],
  }),
  actions: {
    /**
     * store 里保留当前查询词，方便后续扩展复习流转。
     */
    setWord(word: string) {
      this.currentWord = word;
    },
  },
});
