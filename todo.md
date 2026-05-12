# SceneLex Cloudflare 迁移 TODO

目标迁移路径：

1. 先让 Cloudflare Pages 托管 Vue 前端。
2. 再让 Cloudflare Worker 接管 `/api/health`。
3. 再通过 Hyperdrive 连接 Supabase Postgres。
4. 再迁移 `/api/words/*`。
5. 最后逐个替换原 Express 接口。

## 阶段 1：Pages 接管前端

目标：前端先独立部署，页面能正常打开，API 暂时不迁。

- [ ] 在 Cloudflare Pages 新建项目。
- [ ] 设置构建命令：`npm --prefix frontend run build`。
- [ ] 设置输出目录：`frontend/dist`。
- [ ] 保持前端 API 基础路径为 `/api`，不要改成独立 API 域名。
- [ ] 配置 SPA fallback，确保 Vue Router 子路由刷新不 404。
- [ ] 旧 Express 暂时继续运行，作为 API 迁移期后备。

验证：

- [ ] 打开 Pages 域名首页。
- [ ] 刷新 `/reading`、`/profile` 等前端子路由。
- [ ] 确认前端资源加载正常。

## 阶段 2：Worker 接管 `/api/health`

目标：证明 Pages 域名下的 `/api/*` 能进入 Worker。

- [ ] 新增 `worker/` 目录。
- [ ] 新增 `worker/package.json`。
- [ ] 新增 `worker/wrangler.toml`。
- [ ] 新增 `worker/src/index.ts`。
- [ ] 实现 `GET /api/health`。
- [ ] 其他 `/api/*` 暂时返回 `501 Not migrated`。
- [ ] 非 `/api/*` 返回 `404`。
- [ ] 将 Pages 域名下的 `/api/*` 路由到 Worker。

建议响应格式：

```json
{
  "success": true,
  "message": "worker is running",
  "data": {
    "service": "scenelex-worker"
  }
}
```

验证：

- [ ] 执行 `curl https://你的域名/api/health`。
- [ ] 确认返回 JSON。
- [ ] 确认旧 Express 仍能独立访问，方便回滚。

## 阶段 3：Worker 通过 Hyperdrive 连接 Supabase

目标：Worker 能访问 Supabase Postgres，但还不迁业务接口。

- [ ] 在 Cloudflare 创建 Hyperdrive 配置，连接 Supabase Postgres。
- [ ] 在 `worker/wrangler.toml` 添加 `nodejs_compat`。
- [ ] 在 `worker/wrangler.toml` 添加 Hyperdrive binding。
- [ ] 安装 Worker 数据库依赖：`npm --prefix worker install postgres`。
- [ ] 在 Worker 中通过 `env.HYPERDRIVE.connectionString` 创建数据库客户端。
- [ ] 新增 `GET /api/health/db`。
- [ ] `GET /api/health/db` 只执行 `SELECT 1 AS ok`。

`wrangler.toml` 目标形态：

```toml
name = "scenelex-api"
main = "src/index.ts"
compatibility_date = "2026-05-12"
compatibility_flags = ["nodejs_compat"]

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "你的-hyperdrive-id"
```

注意：

- [ ] 不要把 Supabase 连接串写入代码。
- [ ] 不要在 Worker 启动时跑 Express 里的 `initializeDatabase()`。
- [ ] 建表和迁移继续通过本地脚本或 Supabase SQL editor 执行。

验证：

- [ ] 执行 `curl https://你的域名/api/health/db`。
- [ ] 确认返回数据库连通结果。

## 阶段 4：Worker 增加旧 Express fallback proxy

目标：Worker 成为 `/api/*` 入口，但未迁移接口继续转发到旧 Express。

- [ ] 给 Worker 增加环境变量 `LEGACY_API_ORIGIN`。
- [ ] 将未迁移的 `/api/*` 请求代理到 `${LEGACY_API_ORIGIN}/api/*`。
- [ ] 代理时保留 method、headers、body、cookie。
- [ ] 已迁移接口优先由 Worker 处理，不再转发。
- [ ] 代理失败时返回清晰错误，不吞掉旧后端错误内容。

路由策略：

```text
/api/health          -> Worker
/api/health/db       -> Worker
/api/words/lookup    -> 后续迁到 Worker
/api/words/generate  -> 后续迁到 Worker 或继续代理
/api/*               -> proxy 到旧 Express
```

验证：

- [ ] Pages 前端能通过 Worker 访问旧 Express API。
- [ ] 登录态 cookie 在代理后仍然可用。
- [ ] 旧功能没有明显回归。

## 阶段 5：先迁移 `/api/words/*`

目标：先迁最轻的真实业务接口，再处理生成接口。

### 5.1 迁移 `/api/words/lookup`

原因：这个接口只查词库释义，不触发模型生成，适合作为第一个业务接口。

- [ ] 复用当前响应格式。
- [ ] 校验请求体中的 `word`。
- [ ] 将词库查询逻辑迁到 Worker 数据库访问层。
- [ ] 保持前端无需改动。
- [ ] Worker 命中 `/api/words/lookup` 时不再代理到 Express。

验证：

- [ ] 在首页搜索单词。
- [ ] 确认先显示词库中的中文释义。
- [ ] 确认不会触发模型生成。

### 5.2 迁移登录态读取和权限校验

原因：现有 `/api/words` 依赖 `authMiddleware` 和 `accessMiddleware`，生成接口迁移前必须先兼容登录态。

- [ ] 梳理当前 cookie/session/token 格式。
- [ ] 在 Worker 中实现最小可用的登录态读取。
- [ ] 在 Worker 中实现访问权限校验。
- [ ] 保持错误响应和 Express 尽量一致。

验证：

- [ ] 未登录访问受保护接口返回登录错误。
- [ ] 已登录用户能正常访问受保护接口。
- [ ] 访问权限不足时返回明确错误。

### 5.3 评估并迁移 `/api/words/generate`

原因：这个接口会调用 LLM，是否能迁到 Worker 取决于生产模型来源。

- [ ] 如果生产只用 Kimi / DeepSeek 这类 HTTP API，可以迁到 Worker。
- [ ] 如果还要用 Ollama / oMLX 本地模型，先继续代理旧 Express。
- [ ] 如果后续要迁本地模型，先把本地模型封装成 Worker 可访问的公网或内网服务。
- [ ] 保留现有模型限流和并发控制语义。
- [ ] 保持保存预览和系统词书预览行为不变。

验证：

- [ ] 点击生成场景。
- [ ] 确认响应结构和前端卡片兼容。
- [ ] 确认失败时前端能显示明确错误。
- [ ] 确认不会重复保存或清空已展示卡片。

## 阶段 6：逐个替换原 Express 接口

建议迁移顺序：

- [ ] `/api/words/lookup`
- [ ] `/api/auth/session` 和登录态读取类接口
- [ ] `/api/settings`
- [ ] `/api/word-books`
- [ ] `/api/history`
- [ ] `/api/review`
- [ ] `/api/system-word-books`
- [ ] `/api/reading`
- [ ] `/api/ocr`
- [ ] `/api/admin`

每迁一个接口都要完成：

- [ ] Worker 实现同名接口。
- [ ] 响应格式和旧 Express 保持兼容。
- [ ] 前端不用改或只做极小改动。
- [ ] 从 fallback proxy 里排除该接口。
- [ ] 手动跑一遍对应页面主流程。
- [ ] 确认旧 Express 仍可作为回滚目标。

## 暂不优先迁移的部分

- [ ] `/uploads`：Worker 没有本地磁盘持久化，迁移前先决定用 R2、Supabase Storage，还是继续留 Express。
- [ ] OCR：涉及上传、外部服务和可能的长耗时，放在后期迁移。
- [ ] 本地模型：Cloudflare Worker 不能访问本机 `localhost`，需要单独服务化后再迁。
- [ ] Admin：权限和破坏面更大，放到普通用户流程稳定后迁。

## 最终目标架构

```text
Cloudflare Pages
  - Vue 静态前端
  - SPA fallback

Cloudflare Worker
  - /api/health
  - /api/health/db
  - /api/auth/*
  - /api/words/*
  - 逐步替换其他 /api/*

Hyperdrive
  - 连接 Supabase Postgres

旧 Express
  - 迁移期作为 fallback
  - 本地模型、OCR、uploads 暂时保留
  - 所有接口迁完后再下线
```

## 第一轮实际改动范围

建议第一轮只做：

- [ ] 新增 Worker 骨架。
- [ ] 实现 `/api/health`。
- [ ] 实现 `/api/*` fallback proxy 到旧 Express。

第一轮成功标准：

- [ ] Pages 前端能打开。
- [ ] `/api/health` 由 Worker 返回。
- [ ] 未迁移接口仍能通过 Worker 代理到旧 Express。
- [ ] 出问题时可以只撤销 `/api/*` 到 Worker 的路由，快速回到旧后端。
