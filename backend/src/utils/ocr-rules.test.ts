import { describe, expect, it } from 'vitest';
import {
  OCR_LIMITS,
  assertBatchBytes,
  assertPageBytes,
  assertPageCount,
  detectImageType,
  extensionForImageType,
  mergeRecognizedText,
} from './ocr-rules';

describe('图片数量与大小边界', () => {
  it('10 张可以，11 张被拒', () => {
    expect(() => assertPageCount(10)).not.toThrow();
    expect(() => assertPageCount(11)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('单图 20,000,000 字节可以，多 1 字节被拒', () => {
    expect(() => assertPageBytes(OCR_LIMITS.maxPageBytes)).not.toThrow();
    expect(() => assertPageBytes(OCR_LIMITS.maxPageBytes + 1)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('批次总量 200,000,000 字节是上限', () => {
    expect(() => assertBatchBytes(OCR_LIMITS.maxBatchBytes)).not.toThrow();
    expect(() => assertBatchBytes(OCR_LIMITS.maxBatchBytes + 1)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('空文件直接拒绝', () => {
    expect(() => assertPageBytes(0)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});

describe('detectImageType', () => {
  it('识别 JPG / PNG / WEBP 的文件头', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
    expect(
      detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    ).toBe('image/png');

    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
    ]);

    expect(detectImageType(webp)).toBe('image/webp');
  });

  it('其他格式按文件头拒绝，不信任客户端 MIME', () => {
    const gif = Buffer.from('GIF89a', 'ascii');

    expect(() => detectImageType(gif)).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('扩展名只从真实类型推导', () => {
    expect(extensionForImageType('image/jpeg')).toBe('.jpg');
    expect(extensionForImageType('image/png')).toBe('.png');
    expect(extensionForImageType('image/webp')).toBe('.webp');
  });
});

describe('mergeRecognizedText', () => {
  it('按页序合并，和返回顺序无关', () => {
    const text = mergeRecognizedText([
      { pageIndex: 2, status: 'success', text: 'third' },
      { pageIndex: 0, status: 'success', text: 'first' },
      { pageIndex: 1, status: 'success', text: 'second' },
    ]);

    expect(text).toBe('first\n\nsecond\n\nthird');
  });

  it('失败页和跳过的页不参与合并', () => {
    const text = mergeRecognizedText([
      { pageIndex: 0, status: 'success', text: 'first' },
      { pageIndex: 1, status: 'failed', text: '' },
      { pageIndex: 2, status: 'skipped', text: 'ignored' },
      { pageIndex: 3, status: 'success', text: 'fourth' },
    ]);

    expect(text).toBe('first\n\nfourth');
  });

  it('全部为空时返回空串，让调用方提示重拍而不是造文章', () => {
    expect(
      mergeRecognizedText([
        { pageIndex: 0, status: 'success', text: '   ' },
        { pageIndex: 1, status: 'failed', text: '' },
      ]),
    ).toBe('');
  });
});
