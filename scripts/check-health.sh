#!/bin/sh
# 部署回归基线：每次上线前后跑一次，确认服务真的可用。
#
# 只看 HTTP 200 是不够的：Express 的 SPA fallback 在前端 dist 缺失时
# 依然会对任意 GET 返回 200，所以首页要额外校验响应体确实是 HTML。
#
# 用法:
#   sh ./scripts/check-health.sh                          # 本地 127.0.0.1:3003
#   sh ./scripts/check-health.sh https://scenlex.cn       # 线上
#   BASE_URL=https://scenlex.cn sh ./scripts/check-health.sh

set -eu

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:3003}}"
TIMEOUT="${TIMEOUT:-10}"

fail() {
  echo "❌ $1" >&2
  exit 1
}

echo "检查目标: $BASE_URL"

health=$(curl -fsS -m "$TIMEOUT" "$BASE_URL/health") \
  || fail "/health 请求失败，服务未启动或不可达"

# 契约不能松动：前端与监控都依赖这两个字段。
case "$health" in
  *'"success":true'*) ;;
  *) fail "/health 返回内容不符合约定: $health" ;;
esac
case "$health" in
  *'"message":"backend is running"'*) ;;
  *) fail "/health message 字段异常: $health" ;;
esac

home_headers=$(curl -fsS -m "$TIMEOUT" -D - -o /dev/null "$BASE_URL/") \
  || fail "首页请求失败，前端可能未构建（npm run build:frontend）"

# HTTP 头名大小写不敏感，而 Cloudflare 会全部转小写，比较前先统一。
lower_headers=$(printf '%s' "$home_headers" | tr '[:upper:]' '[:lower:]')

case "$lower_headers" in
  *'content-type: text/html'*) ;;
  *) fail "首页 Content-Type 不是 text/html，前端 dist 可能缺失或被覆盖" ;;
esac

echo "✅ /health 正常，首页返回 HTML"
