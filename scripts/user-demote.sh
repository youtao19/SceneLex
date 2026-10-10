#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

print_usage() {
  cat <<'EOF'
用法:
  sh ./scripts/user-demote.sh --email user@example.com

说明:
  --email  要降回普通用户的用户邮箱，必填

最后一个管理员不能降级，否则没有人能再进管理页签发访问密钥。
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_usage
  exit 0
fi

cd "$PROJECT_ROOT"
node backend/scripts/manage-user-access.js demote "$@"
