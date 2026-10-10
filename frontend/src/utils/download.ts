/**
 * 从 Content-Disposition 里取文件名。
 *
 * 后端给的是 `attachment; filename="scenelex-export-2026-10-10.json"`。
 * 解析失败就返回 null，让调用方决定兜底名字——比在这里猜一个好。
 * 只取 filename=，刻意不认 filename*=（RFC 5987 的 UTF-8 形式）：当前后端
 * 生成的文件名只有 ASCII，多写一套解码逻辑没有对应的输入。
 */
export function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) {
    return null
  }

  const match = /filename="?([^";]+)"?/.exec(header)
  const filename = match?.[1]?.trim()

  return filename || null
}

/**
 * 触发浏览器下载。
 *
 * objectURL 必须显式 revoke：不撤销的话这份数据会一直挂在文档上，
 * 导出的是全部个人数据，不该在内存里多留一份。
 */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
