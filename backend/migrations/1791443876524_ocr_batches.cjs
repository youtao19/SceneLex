/**
 * 多页拍照识别：批次/逐页结果 + 私有临时原图，原图按上传起 24 小时硬 TTL。
 */

const up = (pgm) => {
  /**
   * expires_at 在上传时就写死，不靠清理任务算时间：进程挂了也不会留下永久原图。
   */
  pgm.sql(`
    CREATE TABLE ocr_batches (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      article_id BIGINT REFERENCES reading_articles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT ocr_batches_status_check CHECK (status IN ('pending', 'completed', 'cancelled'))
    )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX idx_ocr_batches_user_operation
    ON ocr_batches (user_id, operation_id)
  `);

  pgm.sql(`CREATE INDEX idx_ocr_batches_expires_at ON ocr_batches (expires_at)`);

  /**
   * page_index 是用户确认的页序，不是到达顺序：乱序返回也能按它合并。
   */
  pgm.sql(`
    CREATE TABLE ocr_pages (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL REFERENCES ocr_batches(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      text TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      stored_path TEXT NOT NULL DEFAULT '',
      byte_size INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ocr_pages_status_check CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
      CONSTRAINT ocr_pages_index_check CHECK (page_index >= 0)
    )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX idx_ocr_pages_batch_page
    ON ocr_pages (batch_id, page_index)
  `);
};

/** down 必须真的能把 up 撤掉，否则回滚会把库留在中间状态。 */
const down = (pgm) => {
  pgm.sql(`DROP TABLE ocr_pages`);
  pgm.sql(`DROP TABLE ocr_batches`);
};

module.exports = { up, down };
