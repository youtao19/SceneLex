import { AUTH_STORAGE_KEY, type AuthState } from '../types/auth'
import { readFromStorage } from '../utils/storage'

// 使用相对路径：
// - 开发模式：vite.config.ts 中的 proxy 会把 /api 转发到后端 3003 端口
// - 生产模式：后端直接 serve 前端静态资源，请求走同源
const BASE_URL = '/api'

function readAuthToken() {
  const authState = readFromStorage<AuthState>(AUTH_STORAGE_KEY)
  return authState?.token ?? ''
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: string }
    return data.message || '请求失败'
  } catch {
    const text = await response.text()
    return text || '请求失败'
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = readAuthToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return response.json() as Promise<T>
}

export async function get<T>(url: string): Promise<T> {
  return request<T>(url)
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

export async function patch<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

export async function del<T>(url: string): Promise<T> {
  return request<T>(url, {
    method: 'DELETE'
  })
}
