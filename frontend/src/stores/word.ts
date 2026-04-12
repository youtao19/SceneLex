import { defineStore } from 'pinia';

export const useWordStore = defineStore('word', {
  state: () => ({
    currentWord: '',
    scene: '',
    examples: [] as string[],
  }),
  actions: {
    setWord(word: string) {
      this.currentWord = word;
    },
  },
});

