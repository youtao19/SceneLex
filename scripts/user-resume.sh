#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

print_usage() {
  cat <<'EOF'
用法:
  sh ./scripts/user-resume.sh --email user@example.com

说明:
  --email  要恢复的用户邮箱，必填
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_usage
  exit 0
fi

cd "$PROJECT_ROOT"
node backend/scripts/manage-user-access.js resume "$@"
