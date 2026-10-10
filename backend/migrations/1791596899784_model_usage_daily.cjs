/**
 * 按「用户 × 学习日 × 端点来源」记模型调用次数与 token，用于两件事：
 * 系统端点（管理员出钱的那条）要有日/月上限，管理页要能看到谁在用。
 *
 * 为什么是每天一行而不是一次调用一行：配额问的是「今天用掉多少」，
 * 累加行直接就是答案，不用每次调用都去扫日志表。代价是拿不到单次明细，
 * 但这里要挡的是超额，不是对账。
 *
 * source 只有两个取值：用户自己填的端点（user）和系统端点（system）。
 * 只有 system 受配额限制——前者花的是用户自己的钱。
 */

const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS model_usage_daily (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usage_date DATE NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('user', 'system')),
      calls INTEGER NOT NULL DEFAULT 0,
      prompt_tokens BIGINT NOT NULL DEFAULT 0,
      completion_tokens BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, usage_date, source)
    )
  `);

  /**
   * 主键按 user_id 打头，只服务「某个用户今天/本月用了多少」。
   * 管理页反过来要按日期看所有人，所以日期单独建一个索引。
   */
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_model_usage_daily_date ON model_usage_daily (usage_date)`);
};

const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS model_usage_daily`);
};

module.exports = { up, down };
