/**
 * 文件作用：
 * 暴露前端可操作的本机运行设置。
 */

import { Router } from 'express'
import {
  getAiSettings,
  getLearningSettings,
  getUserApiKeySettings,
  updateAiModelSettings,
  updateLearningSettings,
  updateUserApiKeySettings,
} from '../controllers/settings.controller'
import { adminMiddleware } from '../middlewares/admin.middleware'

const router = Router()

/**
 * 读取当前模型运行配置。
 */
router.get('/ai', adminMiddleware, getAiSettings)

/**
 * 切换当前模型服务和模型名。
 */
router.patch('/ai', adminMiddleware, updateAiModelSettings)

/**
 * 读取当前用户自己的云端模型密钥状态。
 */
router.get('/api-keys', getUserApiKeySettings)

/**
 * 保存或清除当前用户自己的云端模型密钥。
 */
router.patch('/api-keys', updateUserApiKeySettings)

/**
 * 读取学习节奏设置。
 */
router.get('/learning', getLearningSettings)

/**
 * 更新学习节奏设置。
 */
router.patch('/learning', updateLearningSettings)

export default router
