/**
 * 文件作用：
 * 汇总所有模块路由。
 */

import { Router } from 'express'
import { accessMiddleware } from '../middlewares/access.middleware'
import { authMiddleware } from '../middlewares/auth.middleware'
import authRoutes from './auth.routes'
import wordRoutes from './word.routes'
import wordStudyRoutes from './word-study.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/words', authMiddleware, accessMiddleware, wordRoutes)
router.use('/word', authMiddleware, accessMiddleware, wordStudyRoutes)

export default router
