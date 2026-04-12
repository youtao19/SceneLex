/**
 * 文件作用：
 * 后端启动入口，负责监听端口。
 */

import app from './app'
import { env } from './config/env'
import { initializeDatabase } from './config/database'

async function startServer() {
  await initializeDatabase()

  app.listen(env.port, () => {
    console.log(`server running at http://localhost:${env.port}`)
  })
}

startServer().catch((error) => {
  console.error('server failed to start:', error)
  process.exit(1)
})
