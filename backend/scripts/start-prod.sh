#!/usr/bin/env bash
# 后端生产环境启动脚本
# 确保在 SceneLex/backend 目录下运行

set -e

echo "📦 正在编译后端代码..."
npm run build

echo "🚀 启动后端服务..."
# 设置 NODE_ENV 为 production
NODE_ENV=production node dist/server.js
