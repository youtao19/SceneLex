/**
 * 文件作用：
 * 创建 Express 应用实例，统一注册中间件和路由。
 */

import express from 'express'
import path from 'path'
import fs from 'fs'
import cors from 'cors'
import routes from './routes'
import { env } from './config/env'
import { errorMiddleware } from './middlewares/error.middleware'

const app = express()
const backendRootPath = path.resolve(__dirname, '..')
const repoRootPath = path.resolve(backendRootPath, '..')
const uploadRootPath = path.join(backendRootPath, 'uploads')
const frontendDistPath = path.join(repoRootPath, 'frontend/dist')

/**
 * 生产环境只允许明确配置的前端域名跨域访问，避免任意站点调用 API。
 */
const configuredCorsOrigins = env.corsOrigins
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedCorsOrigins = new Set([
  ...configuredCorsOrigins,
  'http://localhost:9003',
  'http://127.0.0.1:9003',
])

const apiCors = cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) {
      callback(null, true)
      return
    }

    if (allowedCorsOrigins.has(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('CORS origin is not allowed'))
  }
})

/**
 * 解析 JSON 请求体。
 */
app.use(express.json())

/**
 * 静态资源访问。
 * 用于访问上传的用户头像等文件。
 */
app.use('/uploads', express.static(uploadRootPath))

/**
 * 注册统一路由。
 */
app.use('/api', apiCors, routes)

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
 * 路径必须从编译文件位置推导，避免不同启动目录导致找不到 dist。
 */
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
