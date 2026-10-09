import { HttpError } from './http-error';

/**
 * SPEC 第 7.1 节：1 MB 按 1,000,000 字节算，客户端、API、代理层必须用同一套数字，
 * 所以这里只保留一份常量，别在别处再写 20 * 1024 * 1024。
 */
export const OCR_LIMITS = {
  maxPages: 10,
  maxPageBytes: 20_000_000,
  maxBatchBytes: 200_000_000,
  ttlHours: 24,
} as const;

export function assertPageCount(pageCount: number): void {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new HttpError(400, '页码非法');
  }

  if (pageCount > OCR_LIMITS.maxPages) {
    throw new HttpError(400, `一次最多识别 ${OCR_LIMITS.maxPages} 张，请减少页数后重试`);
  }
}

export function assertPageBytes(byteSize: number): void {
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    throw new HttpError(400, '图片内容为空');
  }

  if (byteSize > OCR_LIMITS.maxPageBytes) {
    throw new HttpError(400, `单张图片不能超过 ${OCR_LIMITS.maxPageBytes / 1_000_000} MB`);
  }
}

export function assertBatchBytes(totalBytes: number): void {
  if (totalBytes > OCR_LIMITS.maxBatchBytes) {
    throw new HttpError(400, `本次图片总量不能超过 ${OCR_LIMITS.maxBatchBytes / 1_000_000} MB`);
  }
}

export type SupportedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * 只看文件头判断真实类型：multipart 里的 MIME 和文件名都是客户端说了算，
 * 不能拿它当安全依据（SPEC 第 13 节要求服务端独立校验实际类型）。
 */
export function detectImageType(buffer: Buffer): SupportedImageType {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  if (
    buffer.length >= pngSignature.length &&
    pngSignature.every((byte, index) => buffer[index] === byte)
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  throw new HttpError(400, '仅支持 JPG, PNG, WEBP 格式的图片');
}

export function extensionForImageType(imageType: SupportedImageType): string {
  if (imageType === 'image/jpeg') return '.jpg';
  if (imageType === 'image/png') return '.png';

  return '.webp';
}

/**
 * 按用户确认的页序合并：请求完成顺序和页序无关，跳过的页不参与合并。
 * 返回空串表示没有正文，调用方必须提示重拍，不能编造文章。
 */
export function mergeRecognizedText(
  pages: { pageIndex: number; status: string; text: string }[],
): string {
  return pages
    .filter((page) => page.status === 'success' && page.text.trim().length > 0)
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .map((page) => page.text.trim())
    .join('\n\n');
}
