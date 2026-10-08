/**
 * 文件作用：
 * 后端启动入口，负责监听端口。
 */

import app from './app'
import { aiConfig } from './config/ai'
import { env } from './config/env'
import { initializeDatabase } from './config/database'
import { dictionaryService } from './services/dictionary.service'
import { readVisionOcrProvider } from './services/ocr.service'

async function startServer() {
  await initializeDatabase()
  const dictionary = dictionaryService.warmup()

  app.listen(env.port, () => {
    const activeModelConfig = aiConfig[aiConfig.provider]

    console.log(`server running at http://localhost:${env.port}`)
    console.log(`ai provider: ${aiConfig.provider}, model: ${activeModelConfig.model}`)
    console.log(`vision ocr provider: ${readVisionOcrProvider()}`)
    console.log(
      `dictionary warmup: ${dictionary.entries} entries from ${dictionary.source} in ${dictionary.durationMs}ms`,
    )
  })
}

/**
 * 连不上数据库时补一句可操作的提示。
 * 本地配置指向线上库，忘了开 SSH 隧道是最常见的失败原因，
 * 否则使用者只能看到一个裸的 ECONNREFUSED 堆栈。
 */
function isConnectionRefused(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'ECONNREFUSED'
  )
}

startServer().catch((error) => {
  console.error('server failed to start:', error)

  if (isConnectionRefused(error)) {
    console.error(
      '提示: 数据库连不上。本地开发连的是线上库，先另开一个终端跑 npm run dev:db-tunnel 建立隧道。',
    )
  }

  process.exit(1)
})
