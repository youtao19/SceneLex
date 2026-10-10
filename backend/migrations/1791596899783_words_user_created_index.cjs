/**
 * /history 要按 created_at 倒序把用户整份词表取出来，原来没有覆盖这个排序的索引，
 * 词库存得越多排序越贵。
 */

const up = (pgm) => {
  /**
   * 列顺序对齐 ORDER BY created_at DESC, word ASC：
   * user_id 收口到单个用户，created_at 直接提供顺序，word 只用于同一时刻的稳定次序。
   */
  pgm.sql(`
    CREATE INDEX idx_words_user_created
    ON words (user_id, created_at DESC, word ASC)
  `);
};

/** down 必须真的能把 up 撤掉，否则回滚会把库留在中间状态。 */
const down = (pgm) => {
  pgm.sql(`DROP INDEX idx_words_user_created`);
};

module.exports = { up, down };
