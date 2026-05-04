/**
 * 文件作用：
 * 暴露前端可操作的本机运行设置。
 */

import { Router } from 'express'
import { getAiSettings, updateAiModelSettings } from '../controllers/settings.controller'

const router = Router()

/**
 * 读取当前模型运行配置。
 */
router.get('/ai', getAiSettings)

/**
 * 切换当前模型服务和模型名。
 */
router.patch('/ai', updateAiModelSettings)

export default router
