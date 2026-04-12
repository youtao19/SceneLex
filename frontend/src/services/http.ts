/**
 * 文件作用：
 * 封装基础 HTTP 请求。
 */

const BASE_URL = 'http://localhost:3000/api'

/**
 * 通用 POST 请求封装。
 *
 * @param url 接口路径
 * @param body 请求体
 * @returns 接口响应 JSON
 */
export async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  /**
   * 接口异常时，抛出错误交给调用方处理。
   */
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || '请求失败')
  }

  return response.json() as Promise<T>
}