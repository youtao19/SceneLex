// 使用相对路径：
// - 开发模式：vite.config.ts 中的 proxy 会把 /api 转发到后端 3003 端口
// - 生产模式：后端直接 serve 前端静态资源，请求走同源
const BASE_URL = '/api'

/**
 * Response body 只能读取一次；先读文本再解析，才能保留非 JSON 错误内容。
 */
async function readErrorMessage(response: Response) {
  const text = await response.text()

  try {
    const data = JSON.parse(text) as { message?: string }
    return data.message || '请求失败'
  } catch {
    return text || '请求失败'
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)

  const response = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers,
    credentials: 'same-origin',
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
