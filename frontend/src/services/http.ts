const BASE_URL = 'http://localhost:3003/api'

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
  const response = await fetch(`${BASE_URL}${url}`, init)

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
