/**
 * 文件作用：
 * 单词相关路由。
 */

import { Router } from 'express'
import { generateWordContent, lookupWord } from '../controllers/word.controller'

const router = Router()

/**
 * 查询词库中文释义。
 */
router.post('/lookup', lookupWord)

/**
 * 生成单词记忆内容。
 */
router.post('/generate', generateWordContent)

export default router
