/**
 * 建端点表，并把旧的「按 provider 存密钥」转成端点。
 *
 * 背景：以前模型服务是全局三选一（ollama/kimi/deepseek），用户只能给 kimi 或 deepseek
 * 存一份密钥。现在改成用户自己填 baseUrl + key + model，所以需要一个真正的端点表。
 *
 * 这一步不删 user_ai_api_keys：应用层还在读它，等代码切换完再删，
 * 这样每个迁移单独看都是安全的。
 */

const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_ai_endpoints (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_ciphertext TEXT NOT NULL,
      model TEXT NOT NULL,
      vision_model TEXT NOT NULL DEFAULT '',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 每个用户只能有一个默认端点，用部分唯一索引在数据库层保证。
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_endpoints_default
    ON user_ai_endpoints (user_id)
    WHERE is_default = TRUE
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_endpoints_user_label
    ON user_ai_endpoints (user_id, label)
  `);

  /**
   * 旧数据只记录 provider，没有地址和模型名，所以按当时内置的配置补上。
   * 密钥密文原样搬过来即可 —— 加密用的还是同一个 USER_API_KEY_SECRET。
   */
  pgm.sql(`
    INSERT INTO user_ai_endpoints (
      user_id,
      label,
      base_url,
      api_key_ciphertext,
      model,
      vision_model
    )
    SELECT
      key.user_id,
      CASE key.provider
        WHEN 'kimi' THEN 'Kimi'
        WHEN 'deepseek' THEN 'DeepSeek'
        ELSE key.provider
      END,
      CASE key.provider
        WHEN 'kimi' THEN 'https://api.moonshot.cn/v1'
        WHEN 'deepseek' THEN 'https://api.deepseek.com/v1'
        ELSE ''
      END,
      key.api_key_ciphertext,
      CASE key.provider
        WHEN 'kimi' THEN 'kimi-k2.6'
        WHEN 'deepseek' THEN 'deepseek-v4-flash'
        ELSE ''
      END,
      ''
    FROM user_ai_api_keys key
    WHERE key.provider IN ('kimi', 'deepseek')
    ON CONFLICT (user_id, label) DO NOTHING
  `);

  /**
   * 老系统没有「用户默认端点」这个概念，默认的是全局 AI_PROVIDER（线上是 deepseek）。
   * 所以优先把 DeepSeek 端点标为默认，没有就取 id 最小的那个。
   */
  pgm.sql(`
    UPDATE user_ai_endpoints
    SET is_default = TRUE
    WHERE id IN (
      SELECT DISTINCT ON (user_id) id
      FROM user_ai_endpoints
      ORDER BY user_id, (label = 'DeepSeek') DESC, id ASC
    )
  `);
};

/** 回滚会丢掉用户填过的端点地址和模型名，旧表恢复不了这些信息。 */
const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS user_ai_endpoints`);
};

module.exports = { up, down };
