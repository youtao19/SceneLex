#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

print_usage() {
  cat <<'EOF'
用法:
  sh ./scripts/wordbook-import.sh                    # 导入全部三本
  sh ./scripts/wordbook-import.sh --book tem8        # 只导入一本

说明:
  --book  可选 cet6 / tem4 / tem8，不传则导入全部

数据来自 backend/data/<code>-word-list.json，不联网。
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_usage
  exit 0
fi

cd "$PROJECT_ROOT"
node backend/scripts/import-word-book.js "$@"
