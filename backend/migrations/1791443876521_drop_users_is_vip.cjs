/**
 * 删掉 users.is_vip。
 *
 * VIP 唯一的作用是门禁服务器兜底 API Key（canUseSystemApi）。现在没有服务器兜底了，
 * 用户必须自带端点，这个标记就再没有任何效果 —— 留着只会让管理页上有一个按了没反应的开关。
 */

const up = (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS is_vip`);
};

/** 回滚只能把列建回来，原来的 VIP 名单已经丢了。 */
const down = (pgm) => {
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT FALSE`);
};

module.exports = { up, down };
