/**
 * 文件作用：
 * 单词相关路由。
 */

import { Router } from 'express'
import { generateWordContent } from '../controllers/word.controller'

const router = Router()

/**
 * 生成单词记忆内容。
 */
router.post('/generate', generateWordContent)

export default router