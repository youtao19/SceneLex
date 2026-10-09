import { randomUUID } from 'node:crypto';
import { withTransaction } from '../config/database';
import {
  clearStoredPaths,
  createBatch,
  deleteExpiredBatches,
  findBatch,
  findPageStoredPath,
  setBatchArticle,
  setBatchStatus,
  upsertPage,
} from '../repositories/ocr.repository';
import {
  findReadingArticle,
  updateReadingArticleTitle,
  upsertReadingArticle,
} from '../repositories/reading-history.repository';
import { extractTextWithVision } from './ocr.service';
import {
  OCR_LIMITS,
  assertBatchBytes,
  assertPageBytes,
  assertPageCount,
  detectImageType,
  mergeRecognizedText,
} from '../utils/ocr-rules';
import { normalizeOperationId } from '../utils/study-rules';
import { HttpError } from '../utils/http-error';
import {
  readIncomingFile,
  readPageImage,
  removeBatchDir,
  removeIncomingFile,
  removeStoredFile,
  storePageImage,
} from './ocr-storage.service';
import type { AiEndpoint } from '../types/endpoint';
import type { OcrBatch, OcrPageResult } from '../types/ocr';

/**
 * 页序必须是用户确认的 0..9：它不是上传顺序，所以越界或负数都直接拒。
 */
function normalizePageIndex(value: unknown): number {
  const pageIndex = Number(value);

  if (
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    pageIndex >= OCR_LIMITS.maxPages
  ) {
    throw new HttpError(400, `页码必须是 0 到 ${OCR_LIMITS.maxPages - 1} 之间的整数`);
  }

  return pageIndex;
}

function normalizeBatchId(value: unknown): number {
  const batchId = Number(value);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw new HttpError(400, 'batchId 非法');
  }

  return batchId;
}

/**
 * TTL 是硬约束：客户端页面还开着也不续期，到期只能重新选图。
 */
function assertBatchNotExpired(batch: OcrBatch): void {
  if (new Date(batch.expiresAt).getTime() <= Date.now()) {
    throw new HttpError(410, '这批图片已超过 24 小时，请重新拍摄或选图');
  }
}

function assertBatchNotCancelled(batch: OcrBatch): void {
  if (batch.status === 'cancelled') {
    throw new HttpError(409, '这次识别已经取消');
  }
}

/**
 * 页操作需要批次还能改；已保存成文章的批次不允许再上传或改页。
 */
function assertBatchUsable(batch: OcrBatch): void {
  assertBatchNotExpired(batch);
  assertBatchNotCancelled(batch);

  if (batch.status === 'completed') {
    throw new HttpError(409, '这批图片已经保存成文章了');
  }
}

async function requireBatch(userId: number, batchIdInput: unknown): Promise<OcrBatch> {
  const batchId = normalizeBatchId(batchIdInput);
  const batch = await findBatch(userId, batchId);

  if (!batch) {
    throw new HttpError(404, '识别批次不存在');
  }

  assertBatchUsable(batch);

  return batch;
}

/**
 * 保存文章用：已完成不是错误，客户端重试保存要能拿到同一篇。
 */
async function requireBatchForArticle(userId: number, batchIdInput: unknown): Promise<OcrBatch> {
  const batchId = normalizeBatchId(batchIdInput);
  const batch = await findBatch(userId, batchId);

  if (!batch) {
    throw new HttpError(404, '识别批次不存在');
  }

  assertBatchNotExpired(batch);
  assertBatchNotCancelled(batch);

  return batch;
}

function findPage(batch: OcrBatch, pageIndex: number) {
  return batch.pages.find((page) => page.pageIndex === pageIndex) ?? null;
}

/**
 * 模型调用可能很慢，所以不放在事务里；页结果写入是最后一步的短事务。
 */
async function recognizeBuffer(
  buffer: Buffer,
  mimetype: string,
  endpoint: AiEndpoint | null,
): Promise<{ status: 'success' | 'failed'; text: string; error: string }> {
  try {
    const text = await extractTextWithVision(buffer, mimetype, endpoint);

    if (!text.trim()) {
      return { status: 'failed', text: '', error: '这一页没有识别到正文，请重拍或更换图片' };
    }

    return { status: 'success', text, error: '' };
  } catch (error) {
    // 单页失败要落到页状态上，让用户能只重试这一页，而不是整批重来。
    return {
      status: 'failed',
      text: '',
      error: error instanceof Error ? error.message : '识别失败，请重试',
    };
  }
}

export const ocrBatchService = {
  /**
   * 开批次：客户端带稳定操作 ID，重试不会开出第二个批次。
   */
  async createBatch(userId: number, operationIdInput: unknown) {
    const operationId = normalizeOperationId(operationIdInput) ?? `ocr-${randomUUID()}`;

    return createBatch(userId, operationId);
  },

  async getBatch(userId: number, batchIdInput: unknown): Promise<OcrBatch> {
    const batchId = normalizeBatchId(batchIdInput);
    const batch = await findBatch(userId, batchId);

    if (!batch) {
      throw new HttpError(404, '识别批次不存在');
    }

    return batch;
  },

  /**
   * 上传并识别一页。同一页重传就是替换，成功页不会被静默重识别。
   */
  async recognizePage(
    userId: number,
    batchIdInput: unknown,
    pageIndexInput: unknown,
    file: Express.Multer.File | undefined,
    endpoint: AiEndpoint | null,
  ): Promise<OcrPageResult> {
    if (!file) {
      throw new HttpError(400, '请上传需要识别的图片');
    }

    const pageIndex = normalizePageIndex(pageIndexInput);

    try {
      const batch = await requireBatch(userId, batchIdInput);
      const buffer = await readIncomingFile(file.path);
      const imageType = detectImageType(buffer);

      assertPageBytes(buffer.length);
      // 页数按“最大的页序号 + 1”算：中间页失败或跳过不占额外额度。
      assertPageCount(
        Math.max(batch.pageCount, pageIndex + 1),
      );
      assertBatchBytes(
        batch.byteSize - (findPage(batch, pageIndex)?.byteSize ?? 0) + buffer.length,
      );

      const previousStoredPath = await findPageStoredPath(userId, batch.id, pageIndex);
      const stored = await storePageImage(
        userId,
        batch.id,
        pageIndex,
        file.path,
        imageType,
      );

      if (previousStoredPath && previousStoredPath !== stored.relativePath) {
        // 替换图片时清掉旧文件，避免同一页留下两份原图。
        await removeStoredFile(previousStoredPath);
      }

      const recognized = await recognizeBuffer(buffer, imageType, endpoint);

      await withTransaction(async (client) => {
        await upsertPage(client, {
          userId,
          batchId: batch.id,
          pageIndex,
          status: recognized.status,
          text: recognized.text,
          error: recognized.error,
          storedPath: stored.relativePath,
          byteSize: stored.byteSize,
        });
      });

      return {
        pageIndex,
        status: recognized.status,
        text: recognized.text,
        error: recognized.error,
      };
    } finally {
      await removeIncomingFile(file.path);
    }
  },

  /**
   * 只重试失败页：已成功的页不再调用模型，避免重复产生费用。
   */
  async retryPage(
    userId: number,
    batchIdInput: unknown,
    pageIndexInput: unknown,
    endpoint: AiEndpoint | null,
  ): Promise<OcrPageResult> {
    const pageIndex = normalizePageIndex(pageIndexInput);
    const batch = await requireBatch(userId, batchIdInput);
    const page = findPage(batch, pageIndex);

    if (!page) {
      throw new HttpError(404, '这一页还没有上传过图片');
    }

    if (page.status === 'success') {
      throw new HttpError(409, '这一页已经识别成功，不需要重试');
    }

    if (!page.hasImage) {
      throw new HttpError(400, '这一页的原图已不存在，请重新上传');
    }

    const storedPath = await findPageStoredPath(userId, batch.id, pageIndex);

    if (!storedPath) {
      throw new HttpError(400, '这一页的原图已不存在，请重新上传');
    }

    const buffer = await readPageImage(storedPath);
    const recognized = await recognizeBuffer(buffer, detectImageType(buffer), endpoint);

    await withTransaction(async (client) => {
      await upsertPage(client, {
        userId,
        batchId: batch.id,
        pageIndex,
        status: recognized.status,
        text: recognized.text,
        error: recognized.error,
        storedPath,
        byteSize: page.byteSize,
      });
    });

    return {
      pageIndex,
      status: recognized.status,
      text: recognized.text,
      error: recognized.error,
    };
  },

  /**
   * 明确跳过：不静默丢页，跳过后按剩余页序合并。
   */
  async skipPage(
    userId: number,
    batchIdInput: unknown,
    pageIndexInput: unknown,
  ): Promise<OcrPageResult> {
    const pageIndex = normalizePageIndex(pageIndexInput);
    const batch = await requireBatch(userId, batchIdInput);
    const page = findPage(batch, pageIndex);

    if (!page) {
      throw new HttpError(404, '这一页还没有上传过图片');
    }

    const storedPath = (await findPageStoredPath(userId, batch.id, pageIndex)) ?? '';

    await withTransaction(async (client) => {
      await upsertPage(client, {
        userId,
        batchId: batch.id,
        pageIndex,
        status: 'skipped',
        text: '',
        error: '',
        storedPath,
        byteSize: page.byteSize,
      });
    });

    return { pageIndex, status: 'skipped', text: '', error: '' };
  },

  /**
   * 保存文章：只合并成功页，按页序拼接；正文为空一律拒绝，不造文章。
   * 已经保存过的批次直接返回原文章，重试不会重复创建。
   */
  async saveArticle(
    userId: number,
    batchIdInput: unknown,
    titleInput: unknown,
  ): Promise<{ articleId: number; text: string }> {
    const batch = await requireBatchForArticle(userId, batchIdInput);

    if (batch.articleId !== null) {
      const existing = await findReadingArticle(userId, batch.articleId);

      if (existing) {
        return { articleId: existing.id, text: existing.content };
      }
    }

    const text = mergeRecognizedText(batch.pages);

    if (!text) {
      throw new HttpError(400, '没有识别到正文，请重新拍摄或更换图片');
    }

    // upsertReadingArticle 按 (user_id, content_hash) 去重，重试保存不会建出两篇。
    const article = await upsertReadingArticle(userId, text);
    const title = typeof titleInput === 'string' ? titleInput.trim() : '';

    if (title) {
      await updateReadingArticleTitle(userId, article.id, title);
    }

    const storedPaths = await withTransaction(async (client) => {
      const paths = await clearStoredPaths(userId, batch.id);

      await setBatchArticle(client, userId, batch.id, article.id);

      return paths;
    });

    // 保存成功即删原图：长期只留文章文字。
    await Promise.all(storedPaths.map((storedPath) => removeStoredFile(storedPath)));
    await removeBatchDir(userId, batch.id);

    return { articleId: article.id, text };
  },

  /**
   * 取消：用户主动放弃时立刻删原图，不等 24 小时。
   */
  async cancelBatch(userId: number, batchIdInput: unknown): Promise<void> {
    const batch = await requireBatch(userId, batchIdInput);
    const storedPaths = await clearStoredPaths(userId, batch.id);

    await setBatchStatus(userId, batch.id, 'cancelled');
    await Promise.all(storedPaths.map((storedPath) => removeStoredFile(storedPath)));
    await removeBatchDir(userId, batch.id);
  },
};

/**
 * 启动时清一次过期批次：SPEC 明确不做后台常驻任务，只在进程启动时清理。
 */
export async function cleanupExpiredOcrBatches(): Promise<number> {
  const expired = await deleteExpiredBatches();

  await Promise.all(
    expired.map((item) => removeBatchDir(item.userId, item.batchId)),
  );

  return expired.length;
}
