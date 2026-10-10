#!/bin/sh
# 交接前跑一次：确认工作目录里没有会跟着一起交出去的本地文件。
#
# 用 git clone / git archive 交接时这些文件本来就不在——它们全被 gitignore 了。
# 这个脚本是给「打包整个文件夹」这种交接方式兜底的：那种做法会把
# 生产库连接串、用户上传的图片、keystore 口令一起发出去。
#
# 用法:
#   npm run handover:check                    # 检查当前工作目录
#   sh ./scripts/check-handover.sh <目录>      # 检查别处（比如解压后的包）
#
# 只打印文件名，不读文件内容，所以输出可以直接贴出来。

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TARGET="${1:-$PROJECT_ROOT}"

if [ ! -d "$TARGET" ]; then
  echo "目录不存在: $TARGET" >&2
  exit 2
fi

found=0
leaked=0

# 路径相对仓库根写，检查别的目录时也按同样结构找。
LOCAL_ONLY_PATHS='
backend/.env.dev.local
ecosystem.config.cjs
mobile/android/key.properties
mobile/android/local.properties
backups
.pi
.claude/settings.local.json
'

# 这两个目录本身要留在仓库里（各有一个 .gitkeep 占位），只有里面的内容算敏感：
# 它们装的是用户上传的头像和 OCR 原图，属于运行期数据。
LOCAL_ONLY_DIRS='
backend/uploads
ocr-service/uploads
'

echo "检查目标: $TARGET"
echo

# 1) 本地文件是否还在目录里
echo "== 工作目录里的本地文件（打包交接会带走）=="
for rel in $LOCAL_ONLY_PATHS; do
  if [ -e "$TARGET/$rel" ]; then
    echo "  存在  $rel"
    found=1
  fi
done

# 上传目录只看内容：.gitkeep 是故意留在仓库里的占位文件。
for rel in $LOCAL_ONLY_DIRS; do
  [ -d "$TARGET/$rel" ] || continue
  content=$(ls -A "$TARGET/$rel" 2>/dev/null | grep -v '^\.gitkeep$' || true)
  if [ -n "$content" ]; then
    count=$(printf '%s\n' "$content" | wc -l | tr -d ' ')
    # 变量名必须用 ${} 括起来：紧跟着的「（」是多字节字符，某些 sh 会把它
    # 当成变量名的一部分，报出 "rel?: unbound variable"。
    echo "  存在  ${rel}（${count} 项）"
    found=1
  fi
done

# .env.dev.local 的备份是另一类漏法：主文件删了，.bak 还留着。
# 这里的模式要求 .local 后面还有内容，否则会把主文件再列一遍。
for extra in "$TARGET"/backend/.env.*.local.* "$TARGET"/*.jks "$TARGET"/*.keystore; do
  [ -e "$extra" ] || continue
  echo "  存在  ${extra#"$TARGET"/}"
  found=1
done

# 项目自身的 .git 里不该有的东西：keystore 可能被放在仓库内
if [ -d "$TARGET" ]; then
  keystores=$(find "$TARGET" -name '*.jks' -o -name '*.keystore' 2>/dev/null | grep -v '/.git/' || true)
  if [ -n "$keystores" ]; then
    for k in $keystores; do
      echo "  存在  ${k#"$TARGET"/}"
      found=1
    done
  fi
fi

[ "$found" -eq 0 ] && echo "  （无）"
echo

# 2) 这些文件是否被 git 跟踪了 —— 比上面严重，clone 也会把它们带走
echo "== 被 git 跟踪的敏感文件（clone 交接也会带走）=="
cd "$PROJECT_ROOT"
# 两组路径都要查：目录本身被跟踪不要紧，但 `git add -f` 进去的内容会跟着
# clone 一起出去。.gitkeep 是故意留在仓库里的，所以过滤掉它。
for rel in $LOCAL_ONLY_PATHS $LOCAL_ONLY_DIRS; do
  tracked=$(git ls-files -- "$rel" | grep -v '/\.gitkeep$' || true)
  if [ -n "$tracked" ]; then
    for f in $tracked; do
      echo "  已跟踪  $f"
      leaked=1
    done
  fi
done

tracked_secrets=$(git ls-files | grep -E '\.(jks|keystore|pem|p12)$' || true)
if [ -n "$tracked_secrets" ]; then
  for f in $tracked_secrets; do
    echo "  已跟踪  $f"
    leaked=1
  done
fi

[ "$leaked" -eq 0 ] && echo "  （无）"
echo

if [ "$leaked" -eq 1 ]; then
  echo "❌ 有敏感文件进了版本库，先把它移出去并轮换凭据，再谈交接。"
  exit 1
fi

if [ "$found" -eq 1 ]; then
  echo "⚠️  工作目录里有本地文件。用 git clone / git archive 交接是安全的；"
  echo "    要打包这个目录的话，先把上面列出的删掉或排除掉。"
  exit 1
fi

echo "✅ 没有发现会随交接一起出去的本地文件。"
