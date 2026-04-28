/**
 * 文件作用：
 * 创建 Express 应用实例，统一注册中间件和路由。
 */

import express from 'express'
import path from 'path'
import cors from 'cors'
import routes from './routes'
import { errorMiddleware } from './middlewares/error.middleware'

const app = express()

/**
 * 允许前端跨域访问。
 * 前期开发时前后端端口不同，所以必须开启。
 */
app.use(cors())

/**
 * 解析 JSON 请求体。
 */
app.use(express.json())

/**
 * 静态资源访问。
 * 用于访问上传的用户头像等文件。
 */
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

/**
 * 注册统一路由。
 */
app.use('/api', routes)

/**
 * 健康检查接口。
 * 用于确认后端是否正常启动。
 */
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'backend is running'
  })
})

/**
 * 统一错误处理中间件。
 * 注意：必须放在最后。
 */
app.use(errorMiddleware)

export default app