/**
 * 把 VIP 加回来，并新增「系统端点」。
 *
 * 背景：前一个迁移删掉了 is_vip，因为当时服务器兜底 Key 一起去掉了，VIP 就没有作用了。
 * 但现在的需求是：管理员配一组系统端点，VIP 用户可以直接用 —— 这样不会配 API 的人
 * （比如付费的朋友）由管理员开通一下就能用，不需要自己填 URL 和 Key。
 *
 * 所以 VIP 重新有了明确含义：能不能用系统端点。
 * 注意：上一个迁移已经把原来的 VIP 名单删掉了，这里的默认值是 FALSE，
 * 线上那一个原本是 VIP 的账号需要管理员重新标记。
 */

const up = (pgm) => {
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT FALSE`);

  /**
   * 系统端点是一份全局配置，所以用单行表。
   * CHECK (id = 1) 把这个约束写在数据库层，避免以后有人往里插第二行造成歧义。
   */
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS system_ai_endpoint (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_ciphertext TEXT NOT NULL,
      model TEXT NOT NULL,
      vision_model TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS system_ai_endpoint`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS is_vip`);
};

module.exports = { up, down };
