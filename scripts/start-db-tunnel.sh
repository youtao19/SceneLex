#!/bin/sh
# 把线上 PostgreSQL 通过 SSH 隧道映射到本地端口，让本地开发能连线上库。
#
# 线上 PostgreSQL 只监听 127.0.0.1:5432，公网不可达 —— 这是对的，
# 所以不要为了本地连接去改 listen_addresses 或开防火墙，走隧道就够了。
#
# 用法:
#   npm run dev:db-tunnel
#   LOCAL_PORT=5434 npm run dev:db-tunnel     # 换本地端口
#
# 保持这个终端开着；Ctrl+C 断开隧道。

set -eu

SERVER="${SERVER:-root@<origin-ip-removed>}"
LOCAL_PORT="${LOCAL_PORT:-5433}"
REMOTE="${REMOTE:-127.0.0.1:5432}"

echo "隧道: 本地 127.0.0.1:${LOCAL_PORT} -> ${SERVER} 的 ${REMOTE}"
echo "保持本终端开着，Ctrl+C 断开。"
echo

# ExitOnForwardFailure: 本地端口被占用时直接退出，而不是静默起不来
# ServerAliveInterval: 网络空闲时也定期探活，避免隧道悄悄失效
exec ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L "${LOCAL_PORT}:${REMOTE}" \
  "${SERVER}"
