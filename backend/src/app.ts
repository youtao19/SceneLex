/**
 * 文件作用：
 * 创建 Express 应用实例，统一注册中间件和路由。
 */

import express from 'express'
import type { Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import cors from 'cors'
import compression from 'compression'
import routes from './routes'
import { env } from './config/env'
import { errorMiddleware } from './middlewares/error.middleware'

const app = express()
const backendRootPath = path.resolve(__dirname, '..')
const repoRootPath = path.resolve(backendRootPath, '..')
const avatarUploadPath = path.join(backendRootPath, 'uploads/avatars')
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
 * SSE 必须逐段送达才有"逐字出现"的效果，压缩会把它攒在 zlib 缓冲里。
 *
 * 当前的助手接口自己带了 Cache-Control: no-transform，compression 默认就会跳过它；
 * 这里按 Content-Type 再挡一层，是为了让"事件流不压缩"成为压缩层自己的保证，
 * 以后新增的 SSE 接口不必记得补那个头。其余响应交给 compressible 判断。
 */
export function shouldCompress(req: Request, res: Response) {
  const contentType = res.getHeader('Content-Type')

  if (typeof contentType === 'string' && contentType.startsWith('text/event-stream')) {
    return false
  }

  return compression.filter(req, res)
}

/**
 * assets 下的文件名带内容哈希，内容一变文件名就变，可以放心长期缓存；
 * 其余文件（favicon 等）没有哈希，只能每次回源校验。
 */
export function setStaticCacheHeaders(res: Response, filePath: string) {
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return
  }

  res.setHeader('Cache-Control', 'no-cache')
}

/**
 * 响应压缩。放在路由和静态资源之前，才能覆盖到所有出站响应。
 */
app.use(compression({ filter: shouldCompress }))

/**
 * 解析 JSON 请求体。
 */
app.use(express.json())

/**
 * 静态资源访问。
 * 头像需要公开渲染，但不要把整个 uploads 根目录暴露出去。
 */
app.use('/uploads/avatars', express.static(avatarUploadPath, {
  dotfiles: 'deny',
  fallthrough: false,
}))

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
  app.use(express.static(frontendDistPath, {
    setHeaders: setStaticCacheHeaders,
  }))

  // SPA fallback：除了 /api、/uploads、/health 之外的 GET 请求都返回 index.html
  // 让 vue-router 的 history 模式可以工作
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads/avatars') ||
      req.path === '/health'
    ) {
      return next()
    }
    /**
     * index.html 不能长缓存：它引用的 assets 文件名带哈希，页面一旦缓存住，
     * 用户就会一直用旧页面去请求已经不存在的旧资源。
     */
    res.sendFile(path.join(frontendDistPath, 'index.html'), {
      headers: { 'Cache-Control': 'no-cache' },
    })
  })
}

/**
 * 统一错误处理中间件。
 * 注意：必须放在最后。
 */
app.use(errorMiddleware)

export default app
