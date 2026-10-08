/**
 * 文件作用：
 * 个人设置：模型端点和复习节奏。
 */

import { Router } from 'express'
import {
  createEndpoint,
  deleteEndpoint,
  listEndpoints,
  setDefaultEndpoint,
  testEndpointConnection,
  updateEndpoint,
} from '../controllers/endpoint.controller'
import { getLearningSettings, updateLearningSettings } from '../controllers/settings.controller'

const router = Router()

/**
 * 端点列表和预设一起返回，设置页首屏只需要一次请求。
 */
router.get('/endpoints', listEndpoints)

/**
 * 测试连接：不落库，但同样要过 SSRF 校验。
 */
router.post('/endpoints/test', testEndpointConnection)

router.post('/endpoints', createEndpoint)
router.patch('/endpoints/:endpointId', updateEndpoint)
router.delete('/endpoints/:endpointId', deleteEndpoint)
router.post('/endpoints/:endpointId/default', setDefaultEndpoint)

/**
 * 读取学习节奏设置。
 */
router.get('/learning', getLearningSettings)

/**
 * 更新学习节奏设置。
 */
router.patch('/learning', updateLearningSettings)

export default router
