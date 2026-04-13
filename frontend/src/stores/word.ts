import { defineStore } from 'pinia';
import type { WordMeaningItem } from '../types/word';

export const useWordStore = defineStore('word', {
  state: () => ({
    currentWord: '',
    meanings: [] as WordMeaningItem[],
  }),
  actions: {
    /**
     * store 里保留当前查询词，方便后续扩展复习流转。
     */
    setWord(word: string) {
      this.currentWord = word;
    },
    /**
     * 首页预览后缓存一下当前义项，加入记忆库时就不用再拼装一遍。
     */
    setMeanings(meanings: WordMeaningItem[]) {
      this.meanings = meanings;
    },
  },
});
