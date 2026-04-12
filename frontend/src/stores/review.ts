import { defineStore } from 'pinia';

export const useReviewStore = defineStore('review', {
  state: () => ({
    queue: [] as string[],
  }),
  actions: {
    setQueue(queue: string[]) {
      this.queue = queue;
    },
  },
});

