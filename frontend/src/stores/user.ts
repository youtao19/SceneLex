import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    nickname: 'Guest',
    token: '',
  }),
  actions: {
    setToken(token: string) {
      this.token = token;
    },
  },
});

