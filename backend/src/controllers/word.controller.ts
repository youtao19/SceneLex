/**
 * 文件作用：
 * 处理单词生成请求。
 * controller 只负责：
 * 1. 接收参数
 * 2. 调用 service
 * 3. 返回结果
 */

import type { Request, Response, NextFunction } from 'express'
import { wordService } from '../services/word.service'

/**
 * 根据用户输入的单词，生成例句和记忆提示。
 *
 * @param req 请求对象，body 中需要 word 字段
 * @param res 响应对象
 * @param next 错误传递函数
 */
export async function generateWordContent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { word } = req.body as { word?: string }

    /**
     * 基础校验：
     * 1. 必须传 word
     * 2. 必须是字符串
     * 3. 去掉首尾空格后不能为空
     */
    if (!word || typeof word !== 'string' || !word.trim()) {
      return res.status(400).json({
        success: false,
        message: 'word 不能为空'
      })
    }

    const result = await wordService.generateWordContent(word.trim())

    return res.json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}