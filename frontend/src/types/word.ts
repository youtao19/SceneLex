/**
 * 文件作用：
 * 定义单词模块相关的前端类型。
 */

export interface WordGenerateData {
  word: string
  examples: string[]
  tips: string[]
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}