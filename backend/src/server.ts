/**
 * 文件作用：
 * 后端启动入口，负责监听端口。
 */

import app from './app'
import { aiConfig } from './config/ai'
import { env } from './config/env'
import { initializeDatabase } from './config/database'
import { dictionaryService } from './services/dictionary.service'

async function startServer() {
  await initializeDatabase()
  const dictionary = dictionaryService.warmup()

  app.listen(env.port, () => {
    const activeModelConfig = aiConfig[aiConfig.provider]

    console.log(`server running at http://localhost:${env.port}`)
    console.log(`ai provider: ${aiConfig.provider}, model: ${activeModelConfig.model}`)
    console.log(
      `dictionary warmup: ${dictionary.entries} entries from ${dictionary.source} in ${dictionary.durationMs}ms`,
    )
  })
}

startServer().catch((error) => {
  console.error('server failed to start:', error)
  process.exit(1)
})
