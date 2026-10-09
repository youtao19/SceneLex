import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../utils/http-error';
import { extensionForImageType } from '../utils/ocr-rules';
import type { SupportedImageType } from '../utils/ocr-rules';

/**
 * 原图只放后端私有临时目录，不挂静态目录：SPEC 要求按用户授权访问，不能公开可读。
 * backend/data/ 已在 .gitignore 里，用户照片不会被提交进仓库。
 */
const ocrTempRoot = path.join(__dirname, '../../data/ocr-tmp');
const incomingDir = path.join(ocrTempRoot, 'incoming');

/** multer 直接把上传落到这里，避免 20 MB 原图再在 Node 内存里多存一份。 */
export function getOcrIncomingDir() {
  return incomingDir;
}

export async function ensureOcrTempDirs(): Promise<void> {
  await fs.mkdir(incomingDir, { recursive: true });
}

/**
 * 路径虽然来自数据库，也要防越权：解析后必须仍在临时根目录内。
 */
function resolveStoredPath(relativePath: string) {
  const resolved = path.resolve(ocrTempRoot, relativePath);

  if (!resolved.startsWith(`${ocrTempRoot}${path.sep}`)) {
    // 只把路径写进服务端日志：客户端不该看到服务器目录结构。
    console.warn('OCR 原图路径越界：', JSON.stringify(relativePath));
    throw new HttpError(400, '原图路径非法');
  }

  return resolved;
}

export async function readIncomingFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function removeIncomingFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

/**
 * 把上传的临时文件挪进批次目录；同一目录内 rename，不做跨卷复制。
 */
export async function storePageImage(
  userId: number,
  batchId: number,
  pageIndex: number,
  sourcePath: string,
  imageType: SupportedImageType,
): Promise<{ relativePath: string; byteSize: number }> {
  const relativePath = path.join(
    String(userId),
    String(batchId),
    `page-${pageIndex}${extensionForImageType(imageType)}`,
  );
  const targetPath = resolveStoredPath(relativePath);
  const stat = await fs.stat(sourcePath);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.rename(sourcePath, targetPath);

  return { relativePath, byteSize: stat.size };
}

export async function readPageImage(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveStoredPath(relativePath));
}

export async function removeStoredFile(relativePath: string): Promise<void> {
  await fs.rm(resolveStoredPath(relativePath), { force: true });
}

export async function removeBatchDir(userId: number, batchId: number): Promise<void> {
  await fs.rm(getBatchDirPath(userId, batchId), { recursive: true, force: true });
}

/** 测试和排查用：批次原图目录的绝对路径。 */
export function getBatchDirPath(userId: number, batchId: number): string {
  return resolveStoredPath(path.join(String(userId), String(batchId)));
}
