# 数据库迁移

schema 的唯一来源是这个目录，`backend/src/config/database.ts` 只负责调用迁移和播种参考数据。

> `backend/migrations/` 里**只能**放迁移文件。node-pg-migrate 会把目录下每个文件都当迁移加载，放个 README 进来就会让后端启动直接失败（报 `Cannot determine numeric prefix`），所以这份文档放在 `docs/` 而不是代码旁边。

## 运行方式

后端启动时自动执行未应用的迁移（`initializeDatabase()` → `runMigrations()`），所以正常部署不需要额外命令。

### MIGRATE_ON_STARTUP

启动迁移由 `MIGRATE_ON_STARTUP` 控制，**默认开启，只有显式写成 `false` 才关闭**。

- 线上不要配这个变量：默认值就是自动迁移，配成 `false` 会让线上静默地永远不再执行迁移。
- 只有一种情况要设 `false`：本地开发通过 SSH 隧道连线上库（见 README）。否则启动时会把本地还没发布的迁移直接应用到线上。

判断逻辑在 `readMigrateOnStartup()`，有单元测试钉住「默认开启、只有显式 false 才关闭」。

手动排查或回滚：

```bash
npm --prefix backend run migrate:status   # 已应用哪些
npm --prefix backend run migrate:up       # 应用全部待执行迁移
npm --prefix backend run migrate:down     # 回滚最近一个
```

CLI 默认读 `backend/.env.dev.local`；要指向别的库，直接覆盖环境变量：

```bash
DATABASE_URL=postgresql://user@localhost:5432/other_db npm --prefix backend run migrate:up
```

## 新增迁移

文件放在 `backend/migrations/`，命名为 `<时间戳>_<描述>.cjs`，时间戳必须大于已有文件（毫秒级 epoch，保证字典序等于执行序）：

```
1791443876517_baseline.cjs
1791443876518_tighten_words_user_id.cjs
1791443876519_add_reading_bookmarks.cjs   ← 新文件
```

模板：

```js
const up = (pgm) => {
  pgm.sql(`ALTER TABLE reading_articles ADD COLUMN bookmarked BOOLEAN NOT NULL DEFAULT FALSE`);
};

/** down 必须真的能把 up 撤掉，否则回滚会把库留在中间状态。 */
const down = (pgm) => {
  pgm.sql(`ALTER TABLE reading_articles DROP COLUMN bookmarked`);
};

module.exports = { up, down };
```

约定：

- 用 `pgm.sql()` 写原生 SQL，和仓储层保持一致，不引入 DSL。
- 迁移跑在单个事务里，失败会整体回滚，服务也不会启动 —— 这是有意的，宁可起不来也不要半套 schema。
- `up` 里不要写 `IF NOT EXISTS`（基线除外），让重复执行直接报错而不是静默跳过。
- 删除列或改类型前先确认代码里已经没有引用，迁移不回滚数据。
- 需要数据回填时，优先用一条 SQL 完成，避免在迁移里调应用层服务。

## 基线说明

`1791443876517_baseline.cjs` 是迁移系统引入前 `initializeDatabase()` 里累积的全部 DDL 的快照。它保留了 `IF NOT EXISTS`，因为线上库和本地库已经有这些表 —— 基线对它们必须是 no-op，否则第一次启动就会因为建表冲突而失败。

后续迁移不要模仿它的写法。
