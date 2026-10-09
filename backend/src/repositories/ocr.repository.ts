import type { PoolClient } from 'pg';
import { query } from '../config/database';
import { OCR_LIMITS } from '../utils/ocr-rules';
import type { OcrBatch, OcrBatchStatus, OcrPage, OcrPageStatus } from '../types/ocr';

interface BatchRow {
  id: string;
  status: string;
  article_id: string | null;
  created_at: string | Date;
  expires_at: string | Date;
}

interface PageRow {
  page_index: number;
  status: string;
  text: string;
  error: string;
  stored_path: string;
  byte_size: number;
}

function mapPageRow(row: PageRow): OcrPage {
  return {
    pageIndex: row.page_index,
    status: row.status as OcrPageStatus,
    text: row.text,
    error: row.error,
    byteSize: Number(row.byte_size),
    hasImage: row.stored_path.length > 0,
  };
}

/**
 * 批次创建靠 (user_id, operation_id) 唯一索引去重：客户端重试不会开出第二个批次。
 */
export async function createBatch(
  userId: number,
  operationId: string,
): Promise<{ id: number; expiresAt: string }> {
  const result = await query<BatchRow>(
    `
      INSERT INTO ocr_batches (user_id, operation_id, expires_at)
      VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)
      ON CONFLICT (user_id, operation_id)
      DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id, status, article_id, created_at, expires_at
    `,
    [userId, operationId, String(OCR_LIMITS.ttlHours)],
  );

  return {
    id: Number(result.rows[0].id),
    expiresAt: new Date(result.rows[0].expires_at).toISOString(),
  };
}

/**
 * 读取批次必须带 user_id：别人的批次一律当作不存在，避免越权看原图或正文。
 */
export async function findBatch(userId: number, batchId: number): Promise<OcrBatch | null> {
  const batchResult = await query<BatchRow>(
    `
      SELECT id, status, article_id, created_at, expires_at
      FROM ocr_batches
      WHERE user_id = $1
        AND id = $2
    `,
    [userId, batchId],
  );

  if (batchResult.rowCount === 0) {
    return null;
  }

  const pageResult = await query<PageRow>(
    `
      SELECT page_index, status, text, error, stored_path, byte_size
      FROM ocr_pages
      WHERE user_id = $1
        AND batch_id = $2
      ORDER BY page_index ASC
    `,
    [userId, batchId],
  );

  const batch = batchResult.rows[0];
  const pages = pageResult.rows.map(mapPageRow);

  return {
    id: Number(batch.id),
    status: batch.status as OcrBatchStatus,
    articleId: batch.article_id === null ? null : Number(batch.article_id),
    createdAt: new Date(batch.created_at).toISOString(),
    expiresAt: new Date(batch.expires_at).toISOString(),
    pageCount: pages.length,
    byteSize: pages.reduce((total, page) => total + page.byteSize, 0),
    pages,
  };
}

export async function findBatchForUpdate(
  client: PoolClient,
  userId: number,
  batchId: number,
): Promise<OcrBatch | null> {
  const result = await client.query<BatchRow>(
    `
      SELECT id, status, article_id, created_at, expires_at
      FROM ocr_batches
      WHERE user_id = $1
        AND id = $2
      FOR UPDATE
    `,
    [userId, batchId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const pageResult = await client.query<PageRow>(
    `
      SELECT page_index, status, text, error, stored_path, byte_size
      FROM ocr_pages
      WHERE user_id = $1
        AND batch_id = $2
      ORDER BY page_index ASC
    `,
    [userId, batchId],
  );

  const batch = result.rows[0];
  const pages = pageResult.rows.map(mapPageRow);

  return {
    id: Number(batch.id),
    status: batch.status as OcrBatchStatus,
    articleId: batch.article_id === null ? null : Number(batch.article_id),
    createdAt: new Date(batch.created_at).toISOString(),
    expiresAt: new Date(batch.expires_at).toISOString(),
    pageCount: pages.length,
    byteSize: pages.reduce((total, page) => total + page.byteSize, 0),
    pages,
  };
}

/**
 * 同一页重传就是替换：页身份是用户确认的 page_index，不是上传顺序。
 */
export async function upsertPage(
  client: PoolClient,
  input: {
    userId: number;
    batchId: number;
    pageIndex: number;
    status: OcrPageStatus;
    text: string;
    error: string;
    storedPath: string;
    byteSize: number;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO ocr_pages (
        batch_id,
        user_id,
        page_index,
        status,
        text,
        error,
        stored_path,
        byte_size
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (batch_id, page_index)
      DO UPDATE SET
        status = EXCLUDED.status,
        text = EXCLUDED.text,
        error = EXCLUDED.error,
        stored_path = EXCLUDED.stored_path,
        byte_size = EXCLUDED.byte_size,
        updated_at = NOW()
    `,
    [
      input.batchId,
      input.userId,
      input.pageIndex,
      input.status,
      input.text,
      input.error,
      input.storedPath,
      input.byteSize,
    ],
  );
}

export async function setBatchArticle(
  client: PoolClient,
  userId: number,
  batchId: number,
  articleId: number,
): Promise<void> {
  await client.query(
    `
      UPDATE ocr_batches
      SET article_id = $3,
          status = 'completed'
      WHERE user_id = $1
        AND id = $2
    `,
    [userId, batchId, articleId],
  );
}

export async function setBatchStatus(
  userId: number,
  batchId: number,
  status: OcrBatchStatus,
): Promise<void> {
  await query(
    `UPDATE ocr_batches SET status = $3 WHERE user_id = $1 AND id = $2`,
    [userId, batchId, status],
  );
}

/**
 * 清空原图路径并返回它们：先落库再删文件，文件删失败也不会留下可访问的记录。
 *
 * 必须先用 SELECT 取旧值：PostgreSQL 的 `UPDATE ... RETURNING` 返回的是更新后的值，
 * 写成 RETURNING stored_path 只会拿到空串，结果就是原图永远删不掉。
 */
export async function clearStoredPaths(userId: number, batchId: number): Promise<string[]> {
  const selected = await query<{ stored_path: string }>(
    `
      SELECT stored_path
      FROM ocr_pages
      WHERE user_id = $1
        AND batch_id = $2
        AND stored_path <> ''
    `,
    [userId, batchId],
  );
  const storedPaths = selected.rows.map((row) => row.stored_path);

  if (storedPaths.length === 0) {
    return [];
  }

  await query(
    `
      UPDATE ocr_pages
      SET stored_path = '',
          updated_at = NOW()
      WHERE user_id = $1
        AND batch_id = $2
        AND stored_path <> ''
    `,
    [userId, batchId],
  );

  return storedPaths;
}

/**
 * 只取页的原始存储路径：重试要读当时那个文件，不能靠扩展名猜。
 * 路径不放进对外类型，避免把服务器目录结构透给客户端。
 */
export async function findPageStoredPath(
  userId: number,
  batchId: number,
  pageIndex: number,
): Promise<string | null> {
  const result = await query<{ stored_path: string }>(
    `
      SELECT stored_path
      FROM ocr_pages
      WHERE user_id = $1
        AND batch_id = $2
        AND page_index = $3
    `,
    [userId, batchId, pageIndex],
  );

  const storedPath = result.rows[0]?.stored_path ?? '';

  return storedPath.length > 0 ? storedPath : null;
}

/**
 * 过期批次连行带页一起删：清理任务只看这个查询，不需要扫描文件系统。
 */
export async function deleteExpiredBatches(): Promise<
  { userId: number; batchId: number }[]
> {
  const result = await query<{ user_id: string; id: string }>(
    `
      DELETE FROM ocr_batches
      WHERE expires_at < NOW()
      RETURNING user_id, id
    `,
  );

  return result.rows.map((row) => ({
    userId: Number(row.user_id),
    batchId: Number(row.id),
  }));
}
