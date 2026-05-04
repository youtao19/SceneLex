/**
 * 文件作用：
 * 暴露前端可操作的本机运行设置。
 */

import { Router } from 'express'
import {
  getAiSettings,
  getLearningSettings,
  updateAiModelSettings,
  updateLearningSettings,
} from '../controllers/settings.controller'

const router = Router()

/**
 * 读取当前模型运行配置。
 */
router.get('/ai', getAiSettings)

/**
 * 切换当前模型服务和模型名。
 */
router.patch('/ai', updateAiModelSettings)

/**
 * 读取学习节奏设置。
 */
router.get('/learning', getLearningSettings)

/**
 * 更新学习节奏设置。
 */
router.patch('/learning', updateLearningSettings)

export default router
