/**
 * 收敛 words.user_id 的可空性。
 *
 * 老库的 words 先有表、后才有 user_id 列，走的是 `ALTER TABLE ADD COLUMN`，所以允许 NULL；
 * 新库由 CREATE TABLE 一次建成 user_id NOT NULL。两种历史让同一个 schema 有两种形状。
 *
 * 先删无主行：所有查询都带 `WHERE user_id = $1`，user_id 为 NULL 的行应用层永远读不到，
 * 留着只会让这个收紧动作失败。
 */

const up = (pgm) => {
  pgm.sql(`DELETE FROM words WHERE user_id IS NULL`);
  pgm.sql(`ALTER TABLE words ALTER COLUMN user_id SET NOT NULL`);
};

/** 回滚只能放开约束，被删掉的无主行无法恢复。 */
const down = (pgm) => {
  pgm.sql(`ALTER TABLE words ALTER COLUMN user_id DROP NOT NULL`);
};

module.exports = { up, down };
