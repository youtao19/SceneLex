import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDatabasePool, query, withTransaction } from '../config/database';
import { upsertPage } from '../repositories/ocr.repository';
import { cleanupExpiredOcrBatches, ocrBatchService } from './ocr-batch.service';
import { getBatchDirPath, removeBatchDir } from './ocr-storage.service';
import { OCR_LIMITS } from '../utils/ocr-rules';

/**
 * 批次/页/原图清理这类逻辑必须真跑数据库和文件系统：用户隔离、重试、TTL 都靠它们。
 *
 * 默认跳过：`npm test` 不允许依赖数据库。要跑就用隔离测试库显式打开：
 *   RUN_DB_TESTS=1 DATABASE_URL=postgresql://postgres@127.0.0.1:55432/scenlex_test \
 *     npx vitest run src/services/ocr-batch.db.test.ts
 * 绝不要指向生产库：用例会写入并删除测试用户及其原图。
 */
const runDbTests = process.env.RUN_DB_TESTS === '1';

/** 类型判断只看文件头，所以这几字节就够用；不需要真图片。 */
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const GIF_HEADER = Buffer.from('GIF89a', 'ascii');

async function writeFakeUpload(buffer: Buffer) {
  const filePath = path.join(
    os.tmpdir(),
    `ocr-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );

  await fs.writeFile(filePath, buffer);

  return { path: filePath } as Express.Multer.File;
}

describe.skipIf(!runDbTests)('多页 OCR 批次（隔离测试库）', () => {
  const suffix = Date.now();
  let ownerId = 0;
  let otherId = 0;
  const createdBatches: { userId: number; batchId: number }[] = [];

  beforeAll(async () => {
    const owner = await query<{ id: string }>(
      `
        INSERT INTO users (email, nickname, password_salt, password_hash)
        VALUES ($1, 'OCR 测试', 'salt', 'hash')
        RETURNING id
      `,
      [`ocr-${suffix}@example.test`],
    );
    ownerId = Number(owner.rows[0].id);

    const other = await query<{ id: string }>(
      `
        INSERT INTO users (email, nickname, password_salt, password_hash)
        VALUES ($1, '另一个用户', 'salt', 'hash')
        RETURNING id
      `,
      [`ocr-other-${suffix}@example.test`],
    );
    otherId = Number(other.rows[0].id);
  });

  afterAll(async () => {
    for (const batch of createdBatches) {
      await removeBatchDir(batch.userId, batch.batchId);
    }

    await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [[ownerId, otherId]]);
    await getDatabasePool().end();
  });

  async function newBatch() {
    const batch = await ocrBatchService.createBatch(ownerId, `batch-${suffix}-${Math.random()}`);

    createdBatches.push({ userId: ownerId, batchId: batch.id });

    return batch;
  }

  it('批次创建按操作 ID 去重，重试不会开出第二个批次', async () => {
    const operationId = `ocr-idempotent-${suffix}`;
    const first = await ocrBatchService.createBatch(ownerId, operationId);
    const second = await ocrBatchService.createBatch(ownerId, operationId);

    createdBatches.push({ userId: ownerId, batchId: first.id });

    expect(second.id).toBe(first.id);
  });

  it('别人的批次读不到，当作不存在', async () => {
    const batch = await newBatch();

    await expect(ocrBatchService.getBatch(otherId, batch.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('没有图片时拒绝上传', async () => {
    const batch = await newBatch();

    await expect(
      ocrBatchService.recognizePage(ownerId, batch.id, 0, undefined, null),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('页码越界直接拒绝', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(PNG_HEADER);

    await expect(
      ocrBatchService.recognizePage(ownerId, batch.id, OCR_LIMITS.maxPages, file, null),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('非图片按文件头拒绝，不信任客户端 MIME', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(GIF_HEADER);

    await expect(
      ocrBatchService.recognizePage(ownerId, batch.id, 0, file, null),
    ).rejects.toMatchObject({ statusCode: 400 });

    const stored = await ocrBatchService.getBatch(ownerId, batch.id);

    expect(stored.pageCount).toBe(0);
  });

  it('没有可用视觉端点时记成失败页，让用户只重试这一页', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(PNG_HEADER);
    const result = await ocrBatchService.recognizePage(ownerId, batch.id, 0, file, null);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('端点');

    const stored = await ocrBatchService.getBatch(ownerId, batch.id);

    expect(stored.pages[0]).toMatchObject({ pageIndex: 0, status: 'failed', hasImage: true });
  });

  it('失败页可以重试，也可以明确跳过', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(PNG_HEADER);

    await ocrBatchService.recognizePage(ownerId, batch.id, 0, file, null);

    const retried = await ocrBatchService.retryPage(ownerId, batch.id, 0, null);
    expect(retried.status).toBe('failed');

    const skipped = await ocrBatchService.skipPage(ownerId, batch.id, 0);
    expect(skipped.status).toBe('skipped');
  });

  it('已成功的页不允许重试，避免重复调用模型', async () => {
    const batch = await newBatch();

    await withTransaction(async (client) => {
      await upsertPage(client, {
        userId: ownerId,
        batchId: batch.id,
        pageIndex: 0,
        status: 'success',
        text: 'already done',
        error: '',
        storedPath: '',
        byteSize: 0,
      });
    });

    await expect(
      ocrBatchService.retryPage(ownerId, batch.id, 0, null),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('按页序合并保存文章，重试保存返回同一篇，并删掉原图', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(PNG_HEADER);

    // 先真上传一页，确保批次目录里确实有原图。
    await ocrBatchService.recognizePage(ownerId, batch.id, 2, file, null);
    const batchDir = getBatchDirPath(ownerId, batch.id);

    expect(await pathExists(batchDir)).toBe(true);

    // 再直接写入成功页，绕开模型：这里要验证的是合并与保存，不是模型。
    await withTransaction(async (client) => {
      await upsertPage(client, {
        userId: ownerId,
        batchId: batch.id,
        pageIndex: 1,
        status: 'success',
        text: 'second paragraph',
        error: '',
        storedPath: '',
        byteSize: 0,
      });
      await upsertPage(client, {
        userId: ownerId,
        batchId: batch.id,
        pageIndex: 0,
        status: 'success',
        text: 'first paragraph',
        error: '',
        storedPath: '',
        byteSize: 0,
      });
    });

    const saved = await ocrBatchService.saveArticle(ownerId, batch.id, '');
    const savedAgain = await ocrBatchService.saveArticle(ownerId, batch.id, '');

    expect(saved.text).toBe('first paragraph\n\nsecond paragraph');
    expect(savedAgain.articleId).toBe(saved.articleId);
    expect(await pathExists(batchDir)).toBe(false);

    const stored = await ocrBatchService.getBatch(ownerId, batch.id);

    expect(stored.status).toBe('completed');
    expect(stored.pages.every((page) => !page.hasImage)).toBe(true);
  });

  it('全部页都没有正文时不创建文章', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(PNG_HEADER);

    await ocrBatchService.recognizePage(ownerId, batch.id, 0, file, null);

    await expect(
      ocrBatchService.saveArticle(ownerId, batch.id, ''),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('取消会立刻删原图，不等 24 小时', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(PNG_HEADER);

    await ocrBatchService.recognizePage(ownerId, batch.id, 0, file, null);
    await ocrBatchService.cancelBatch(ownerId, batch.id);

    expect(await pathExists(getBatchDirPath(ownerId, batch.id))).toBe(false);

    const stored = await ocrBatchService.getBatch(ownerId, batch.id);

    expect(stored.status).toBe('cancelled');
  });

  it('过期批次连行带原图一起清掉', async () => {
    const batch = await newBatch();
    const file = await writeFakeUpload(PNG_HEADER);

    await ocrBatchService.recognizePage(ownerId, batch.id, 0, file, null);
    await query(`UPDATE ocr_batches SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [
      batch.id,
    ]);

    const removed = await cleanupExpiredOcrBatches();

    expect(removed).toBeGreaterThanOrEqual(1);
    await expect(ocrBatchService.getBatch(ownerId, batch.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await pathExists(getBatchDirPath(ownerId, batch.id))).toBe(false);
  });

  it('过期批次不允许再上传或保存', async () => {
    const batch = await newBatch();

    await query(`UPDATE ocr_batches SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [
      batch.id,
    ]);

    const file = await writeFakeUpload(PNG_HEADER);

    await expect(
      ocrBatchService.recognizePage(ownerId, batch.id, 0, file, null),
    ).rejects.toMatchObject({ statusCode: 410 });
  });
});

async function pathExists(target: string) {
  try {
    await fs.stat(target);

    return true;
  } catch {
    return false;
  }
}
