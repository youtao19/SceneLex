/**
 * 文件作用：
 * 汇总所有模块路由。
 */

import { Router } from 'express'
import wordRoutes from './word.routes'
import wordStudyRoutes from './word-study.routes'

const router = Router()

router.use('/words', wordRoutes)
router.use('/word', wordStudyRoutes)

export default router
