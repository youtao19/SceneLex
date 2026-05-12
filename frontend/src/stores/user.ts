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
      user: null,
    }
  )
}

export const useUserStore = defineStore('user', {
  state: (): AuthState => readInitialAuthState(),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    isAdmin: (state) => state.user?.role === 'admin',
    canUseSystemApi: (state) => state.user?.role === 'admin' || state.user?.isVip === true,
    nickname: (state) => state.user?.nickname ?? 'Guest',
  },
  actions: {
    /**
     * 登录结果只持久化用户信息，会话 token 留在 HttpOnly Cookie 里。
     */
    setSession(session: AuthSession) {
      this.user = session.user
      saveToStorage(AUTH_STORAGE_KEY, {
        user: this.user,
      })
    },

    /**
     * 资料页保存后只更新用户信息，不能影响后端 Cookie 会话。
     */
    setUser(user: AuthUser) {
      this.user = user
      saveToStorage(AUTH_STORAGE_KEY, {
        user: this.user,
      })
    },

    /**
     * 退出时同时清掉内存和本地缓存，避免下次启动继续显示旧用户。
     */
    clearSession() {
      this.user = null
      localStorage.removeItem(AUTH_STORAGE_KEY)
    },
  },
})
