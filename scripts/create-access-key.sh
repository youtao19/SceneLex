#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

print_usage() {
  cat <<'EOF'
用法:
  ./scripts/create-access-key.sh --days 30
  ./scripts/create-access-key.sh --days 30 --note "first user"

说明:
  --days  注册成功后可使用的天数，必填
  --note  给管理员自己的备注，选填
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_usage
  exit 0
fi

cd "$PROJECT_ROOT"
node backend/scripts/create-access-key.js "$@"
