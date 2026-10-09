/**
 * 学习日改按北京时间 04:00 划分，并给评分/撤销补上幂等与版本依据。
 */

const up = (pgm) => {
  /**
   * 新词目标和每日复习限制是两个独立设置：混成一个会让“目标 0 表示只复习”失效。
   */
  pgm.sql(`
    ALTER TABLE user_learning_settings
    ADD COLUMN daily_new_word_target INTEGER NOT NULL DEFAULT 20
  `);

  pgm.sql(`
    ALTER TABLE user_learning_settings
    ADD CONSTRAINT user_learning_settings_daily_new_word_target_check
    CHECK (daily_new_word_target BETWEEN 0 AND 200)
  `);

  pgm.sql(`
    ALTER TABLE user_learning_settings
    ADD COLUMN current_system_book_id BIGINT REFERENCES system_word_books(id) ON DELETE SET NULL
  `);

  /**
   * study_version 用于双端冲突检测；first_learned_at 是“今日新词完成数”的唯一依据，
   * 单独一列才能让撤销首次完成时把计数收回去而不删词卡（收藏信息要保留）。
   */
  pgm.sql(`ALTER TABLE words ADD COLUMN study_version INTEGER NOT NULL DEFAULT 0`);
  pgm.sql(`ALTER TABLE words ADD COLUMN first_learned_at TIMESTAMPTZ`);

  /**
   * 老数据按现有“保存即已学”口径回填，否则老用户的历史词会被算成今天完成的新词。
   */
  pgm.sql(`UPDATE words SET first_learned_at = created_at WHERE first_learned_at IS NULL`);

  pgm.sql(`
    CREATE INDEX idx_words_user_first_learned
    ON words (user_id, first_learned_at)
  `);

  /**
   * before_state 存评分前的排期快照，撤销只认服务端这份记录，不再相信客户端传来的快照。
   */
  pgm.sql(`
    CREATE TABLE study_operations (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      word_id BIGINT REFERENCES words(id) ON DELETE SET NULL,
      request_fingerprint TEXT NOT NULL,
      before_state JSONB,
      result JSONB NOT NULL,
      study_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX idx_study_operations_user_operation
    ON study_operations (user_id, operation_id)
  `);

  pgm.sql(`
    CREATE INDEX idx_study_operations_user_word
    ON study_operations (user_id, word_id, id DESC)
  `);
};

/** down 必须真的能把 up 撤掉，否则回滚会把库留在中间状态。 */
const down = (pgm) => {
  pgm.sql(`DROP TABLE study_operations`);
  pgm.sql(`DROP INDEX idx_words_user_first_learned`);
  pgm.sql(`ALTER TABLE words DROP COLUMN first_learned_at`);
  pgm.sql(`ALTER TABLE words DROP COLUMN study_version`);
  pgm.sql(`ALTER TABLE user_learning_settings DROP COLUMN current_system_book_id`);
  pgm.sql(`
    ALTER TABLE user_learning_settings
    DROP CONSTRAINT user_learning_settings_daily_new_word_target_check
  `);
  pgm.sql(`ALTER TABLE user_learning_settings DROP COLUMN daily_new_word_target`);
};

module.exports = { up, down };
