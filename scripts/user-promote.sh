#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

print_usage() {
  cat <<'EOF'
用法:
  sh ./scripts/user-promote.sh --email user@example.com

说明:
  --email  要提升为管理员的用户邮箱，必填

新库没有任何账号，改角色的接口又要求调用者已经是管理员，
所以第一个管理员只能用这条命令产生。重复执行是幂等的。
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_usage
  exit 0
fi

cd "$PROJECT_ROOT"
node backend/scripts/manage-user-access.js promote "$@"
