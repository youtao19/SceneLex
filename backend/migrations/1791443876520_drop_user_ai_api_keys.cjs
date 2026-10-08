/**
 * 删掉旧的按 provider 存密钥的表。
 *
 * 数据在上一个迁移里已经搬进 user_ai_endpoints，应用层也全部改成读端点，
 * 所以这里可以安全删除。分成两步是为了让每个迁移单独看都成立：
 * 先建新表并复制数据，再等代码切换完才删旧表。
 */

const up = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS user_ai_api_keys`);
};

/**
 * 回滚只能把空表建回来，原来的密钥行已经在 up 里被删掉了。
 * 真要恢复数据得从备份里捞。
 */
const down = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_ai_api_keys (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      api_key_ciphertext TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, provider),
      CONSTRAINT user_ai_api_keys_provider_check CHECK (provider IN ('kimi', 'deepseek'))
    )
  `);
};

module.exports = { up, down };
