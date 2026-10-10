import { describe, expect, it } from 'vitest'
import { parseFilenameFromDisposition } from './download'

describe('parseFilenameFromDisposition', () => {
  it('取出带引号的文件名', () => {
    expect(
      parseFilenameFromDisposition('attachment; filename="scenelex-export-2026-10-10.json"'),
    ).toBe('scenelex-export-2026-10-10.json')
  })

  it('不带引号也能取出', () => {
    expect(parseFilenameFromDisposition('attachment; filename=export.json')).toBe('export.json')
  })

  it('缺少头部时返回 null，由调用方决定兜底名字', () => {
    expect(parseFilenameFromDisposition(null)).toBeNull()
    expect(parseFilenameFromDisposition('attachment')).toBeNull()
    expect(parseFilenameFromDisposition('attachment; filename=""')).toBeNull()
  })
})
