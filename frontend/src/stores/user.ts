import { defineStore } from 'pinia'
import {
  AUTH_STORAGE_KEY,
  type AuthSession,
  type AuthState,
  type AuthUser,
} from '../types/auth'
import { readFromStorage, saveToStorage } from '../utils/storage'

function readInitialAuthState(): AuthState {
  return (
    readFromStorage<AuthState>(AUTH_STORAGE_KEY) ?? {
      token: '',
      user: null,
    }
  )
}

export const useUserStore = defineStore('user', {
  state: (): AuthState => readInitialAuthState(),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    isAdmin: (state) => state.user?.role === 'admin',
    nickname: (state) => state.user?.nickname ?? 'Guest',
  },
  actions: {
    /**
     * 登录结果统一在 store 持久化，刷新后路由守卫才能继续识别当前用户。
     */
    setSession(session: AuthSession) {
      this.token = session.token
      this.user = session.user
      saveToStorage(AUTH_STORAGE_KEY, {
        token: this.token,
        user: this.user,
      })
    },

    /**
     * 资料页保存后只更新用户信息，不能替换 token，否则会把当前会话弄丢。
     */
    setUser(user: AuthUser) {
      this.user = user
      saveToStorage(AUTH_STORAGE_KEY, {
        token: this.token,
        user: this.user,
      })
    },

    /**
     * 退出时同时清掉内存和本地缓存，避免过期 token 在下次启动时继续被带上。
     */
    clearSession() {
      this.token = ''
      this.user = null
      localStorage.removeItem(AUTH_STORAGE_KEY)
    },
  },
})
