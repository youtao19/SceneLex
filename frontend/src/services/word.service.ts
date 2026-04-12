/**
 * 文件作用：
 * 单词模块接口调用封装。
 */

import { post } from './http'
import type { ApiResponse, WordGenerateData } from '../types/word'

/**
 * 请求后端生成单词记忆内容。
 *
 * @param word 用户输入的单词
 * @returns 结构化结果
 */
export async function generateWord(word: string) {
  return post<ApiResponse<WordGenerateData>>('/words/generate', { word })
}