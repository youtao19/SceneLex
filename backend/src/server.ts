/**
 * 文件作用：
 * 后端启动入口，负责监听端口。
 */

import app from './app'

const PORT = 3003

app.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`)
})