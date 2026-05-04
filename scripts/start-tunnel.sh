#!/usr/bin/env bash
# 启动生产模式：后端 serve 前端静态资源 + ngrok 暴露到公网。
#
# 前置：
#   1. brew install ngrok
#   2. 注册 ngrok 账号：https://dashboard.ngrok.com/signup
#   3. 配置 token：ngrok config add-authtoken <YOUR_TOKEN>
#
# 用法：npm run start:tunnel
#       PORT=3003 npm run start:tunnel  # 自定义端口

set -e

# 检查 ngrok 是否已安装
if ! command -v ngrok > /dev/null 2>&1; then
  echo "❌ 未检测到 ngrok。请先安装："
  echo "    brew install ngrok"
  echo "或访问 https://ngrok.com/download 下载"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# 自动 build（前端 dist 不存在时）
if [ ! -d "frontend/dist" ]; then
  echo "⚠️  frontend/dist 不存在，正在构建前端..."
  npm run build:frontend
fi

# 自动 build（后端 dist 不存在时）
if [ ! -f "backend/dist/server.js" ]; then
  echo "⚠️  backend/dist/server.js 不存在，正在构建后端..."
  npm run build:backend
fi

# 后端端口（默认与 backend/.env 一致：3003）
PORT="${PORT:-3003}"

# 启动后端（后台）
echo "🚀 启动后端 (port ${PORT}) ..."
PORT="$PORT" node backend/dist/server.js &
BACKEND_PID=$!

# 退出时清理
cleanup() {
  echo ""
  echo "正在关闭后端 (pid ${BACKEND_PID}) ..."
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM EXIT

# 等后端就绪（最多 30 秒）
echo "⏳ 等待后端启动..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:${PORT}/health" > /dev/null 2>&1; then
    echo "✅ 后端已就绪"
    break
  fi
  sleep 1
  if [ "$i" = "30" ]; then
    echo "❌ 后端启动超时，请检查日志"
    exit 1
  fi
done

echo ""
echo "──────────────────────────────────────────────────────"
echo "🌐 启动 ngrok ..."
echo "ngrok 启动后会显示形如 https://xxxx.ngrok-free.app 的 URL，"
echo "把这个 URL 发给用户访问即可。"
echo "Ctrl+C 退出会自动关闭后端。"
echo "──────────────────────────────────────────────────────"
echo ""

# 启动 ngrok（前台），http 反向代理到本地后端
ngrok http "$PORT"
