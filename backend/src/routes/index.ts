/**
 * 文件作用：
 * 汇总所有模块路由。
 */

import { Router } from 'express'
import { accessMiddleware } from '../middlewares/access.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { authMiddleware } from '../middlewares/auth.middleware'
import { modelRateLimit } from '../middlewares/rate-limit.middleware'
import adminRoutes from './admin.routes'
import authRoutes from './auth.routes'
import historyRoutes from './history.routes'
import ocrRoutes from './ocr.routes'
import readingRoutes from './reading.routes'
import settingsRoutes from './settings.routes'
import systemWordBookRoutes from './system-word-book.routes'
import wordBookRoutes from './word-book.routes'
import wordRoutes from './word.routes'
import wordStudyRoutes from './word-study.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/admin', authMiddleware, accessMiddleware, adminMiddleware, adminRoutes)
router.use('/history', authMiddleware, accessMiddleware, historyRoutes)
router.use('/ocr', authMiddleware, accessMiddleware, modelRateLimit, ocrRoutes)
router.use('/reading', authMiddleware, accessMiddleware, readingRoutes)
router.use('/settings', authMiddleware, accessMiddleware, settingsRoutes)
router.use('/system-word-books', authMiddleware, accessMiddleware, systemWordBookRoutes)
router.use('/word-books', authMiddleware, accessMiddleware, wordBookRoutes)
router.use('/words', authMiddleware, accessMiddleware, wordRoutes)
router.use('/word', authMiddleware, accessMiddleware, wordStudyRoutes)

export default router
