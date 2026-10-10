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
#
# 服务器地址不写死在仓库里：公开的源站 IP 会让 Cloudflare 的防护形同虚设。
# 按下面的顺序取，取不到就停下来告诉你怎么办。

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

# 1) 环境变量（临时用、CI 用）
# 2) scripts/.tunnel-server，一行 root@your-host，已被 gitignore
# 3) ~/.ssh/config 里的别名：SERVER=scenelex-prod npm run dev:db-tunnel
if [ -z "${SERVER:-}" ] && [ -f "${SCRIPT_DIR}/.tunnel-server" ]; then
  SERVER=$(grep -v '^[[:space:]]*#' "${SCRIPT_DIR}/.tunnel-server" | grep -v '^[[:space:]]*$' | head -1)
fi

if [ -z "${SERVER:-}" ]; then
  cat >&2 <<'EOF'
没有指定服务器地址。

三选一：
  SERVER=root@your-host npm run dev:db-tunnel
  echo 'root@your-host' > scripts/.tunnel-server      # 一次配好，之后免输
  SERVER=<~/.ssh/config 里的别名> npm run dev:db-tunnel

scripts/.tunnel-server 已被 gitignore，不要把真实地址写进仓库其它文件。
EOF
  exit 1
fi

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
