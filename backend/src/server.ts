/**
 * 文件作用：
 * 后端启动入口，负责监听端口。
 */

import app from './app'
import { assertProductionConfig, env } from './config/env'
import { initializeDatabase } from './config/database'
import { dictionaryService } from './services/dictionary.service'
import { cleanupExpiredOcrBatches } from './services/ocr-batch.service'
import { ensureOcrTempDirs } from './services/ocr-storage.service'

async function startServer() {
  // 放在连数据库之前：配置错误应该立刻退出，不必先等一次连接超时。
  assertProductionConfig(env)
  await initializeDatabase()
  // 过期原图只在启动时清一次：SPEC 明确不做后台常驻任务，也不保证关机后继续执行。
  await ensureOcrTempDirs()
  const removedBatches = await cleanupExpiredOcrBatches()

  if (removedBatches > 0) {
    console.log(`cleaned ${removedBatches} expired OCR batches`)
  }

  const dictionary = dictionaryService.warmup()

  app.listen(env.port, () => {
    console.log(`server running at http://localhost:${env.port}`)
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
