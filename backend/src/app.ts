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
import helmet from 'helmet'
import routes from './routes'
import { env } from './config/env'
import { errorMiddleware } from './middlewares/error.middleware'
import { loggerMiddleware } from './middlewares/logger.middleware'

const app = express()

/**
 * 不设这个的话 req.ip 恒为 127.0.0.1（Nginx 的地址），于是「按 IP 计数」的
 * 登录/注册限流变成全站共用一个桶：15 分钟 20 次是所有用户加起来的额度，
 * 人一多就一起被锁死，暴力破解防护也失去意义。
 *
 * 跳数含义与前提见 config/env.ts 的 readTrustProxyHops。
 */
app.set('trust proxy', env.trustProxyHops)

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

    // 不抛错，只是不返回放行头。
    //
    // 以前这里 callback(new Error(...))，结果是 500。而浏览器对**非 GET 的同源
    // 请求也会带 Origin**，所以只要部署时没把站点自己的域名配进
    // CORS_ORIGINS，前端每次登录、注册、保存单词都会 500 —— 看着像后端坏了。
    //
    // 抛错也并不能多挡住什么：CORS 由浏览器强制，非浏览器客户端（curl）本来就
    // 无视它，跨站表单提交也照样发得出去（那是 SameSite Cookie 在防）。
    // 不给放行头，跨域浏览器请求自然读不到响应，这才是正确的语义。
    callback(null, false)
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
 * 请求日志必须排在最前面：只有从这里开始计时，才量得到压缩、路由和静态资源的全部开销。
 */
app.use(loggerMiddleware)

/**
 * 头像配了 R2 时存的是对象存储的绝对 URL，所以 img-src 要把那个域名放行。
 * 只取到 origin：路径和查询串对 CSP 没有意义。
 *
 * 配了个不合法的地址时返回空数组而不是抛错：CSP 少一条指令顶多让头像显示不出来，
 * 而在这里抛错会让整个服务起不来，代价不对等。
 */
export function readAvatarOrigin() {
  if (!env.r2AvatarPublicBaseUrl) {
    return []
  }

  try {
    return [new URL(env.r2AvatarPublicBaseUrl).origin]
  } catch {
    return []
  }
}

/**
 * 安全响应头。CSP 按前端实际用到的东西来定，不留用不上的口子：
 * - 构建产物只有 /assets 下的外链 JS 和 CSS，模板里没有内联 <script>，
 *   也没有静态 style 属性（样式都走 :style 绑定和构建后的样式表），
 *   所以 script-src / style-src 都不需要 'unsafe-inline'
 * - 阅读助手是 SSE，同源，connect-src 'self' 够用
 * - 图片来自同源 /uploads/avatars 或 R2 的公开域名
 *
 * 刻意不加 upgrade-insecure-requests：线上浏览器看到的一直是 Cloudflare 的
 * https，这条永远不会触发；反倒会让用 http 直连试跑的人（内网、临时机器）
 * 所有子资源被升级到 https 而整个前端打不开。收益接近零，代价是难查的故障。
 *
 * HSTS 只在生产开：HTTP 响应上的 HSTS 本来也会被浏览器忽略，本地带上只会让人困惑。
 */
const isProduction = env.nodeEnv === 'production'
const avatarOrigins = readAvatarOrigin()

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:', ...avatarOrigins],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      // 页面上的 <form> 都带 @submit.prevent，本来就不会真的提交。
      // 这里用 'self' 而不是 'none'：要挡的是「注入的表单把数据发去外站」，
      // 同源提交留着，避免哪天有人漏写 .prevent 就变成一个查不出原因的坏表单。
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
  },
  // 与上面的 frame-ancestors 保持一致；这个应用没有需要被嵌 iframe 的场景。
  xFrameOptions: { action: 'deny' },
  // 生产才带 HSTS：本地 http 上它没有意义，只会让后续调试困惑。
  strictTransportSecurity: isProduction
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
  // Referrer 用默认的 no-referrer：出站请求不该带上站内路径。
}))

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
