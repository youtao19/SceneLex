/**
 * 文件作用：
 * 创建 Express 应用实例，统一注册中间件和路由。
 */

import express from 'express'
import path from 'path'
import fs from 'fs'
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
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

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
 * 生产模式：serve 前端打包产物 + SPA history 模式 fallback。
 * 仅当 frontend/dist 存在时启用，避免影响纯后端开发流程。
 *
 * 路径计算：
 * 始终相对于当前工作目录（项目根目录），兼容开发与编译后运行。
 */
const frontendDistPath = path.resolve(process.cwd(), '../frontend/dist')
if (fs.existsSync(frontendDistPath)) {
  // 提供静态资源（assets/*.js, *.css, favicon 等）
  app.use(express.static(frontendDistPath))

  // SPA fallback：除了 /api、/uploads、/health 之外的 GET 请求都返回 index.html
  // 让 vue-router 的 history 模式可以工作
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path === '/health'
    ) {
      return next()
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'))
  })
}

/**
 * 统一错误处理中间件。
 * 注意：必须放在最后。
 */
app.use(errorMiddleware)

export default app