# SceneLex 服务器操作文档

本文档记录 SceneLex 在服务器 `<origin-ip-removed>` 上的实际运行方式，以及更新代码后的重启步骤。

最近一次运行状态核验：2026-10-08（北京时间）。以下运行状态是该次 SSH 检查的快照，后续发布后应重新核对。

## 服务器信息

- 登录用户：`root`
- 操作系统：Ubuntu 24.04.2 LTS
- 项目目录：`/root/SceneLex`
- 对外域名：`https://scenlex.cn`、`https://www.scenlex.cn`
- 后端端口：`3003`
- Node.js：22.22.2
- 进程管理：PM2，应用名 `scenelex`，单进程 fork 模式
- 后端启动文件：`/root/SceneLex/backend/dist/server.js`
- 反向代理：Nginx
- 数据库：本机 PostgreSQL 16

前端、后端、数据库均运行在这台服务器上。Nginx、PM2 和 PostgreSQL 由 systemd 管理；已核实 Nginx 与 `pm2-root` 开机启动配置启用。

## 当前运行链路

请求链路如下：

```text
用户浏览器
-> https://scenlex.cn 或 https://www.scenlex.cn
-> Cloudflare
-> <origin-ip-removed> 的 Nginx 443
-> http://127.0.0.1:3003
-> Express 后端
   ├─ 页面和静态资源 -> /root/SceneLex/frontend/dist
   └─ /api/* -> PostgreSQL 127.0.0.1:5432/scenelex_db
```

Express 后端同时负责两件事：

- `/api/*`：处理后端 API 请求。
- 非 API 页面：读取 `frontend/dist`，返回前端打包后的 Vue 页面。

`npm run build` 同时构建前后端。生产环境由同一个 Express 进程提供页面和 API，不需要启动 Vite 开发服务器。

### 已核实的代码和配置

- 服务器当前检出分支：`production`。
- 服务器当前提交：`d265968`（`feat: 添加注册页密钥申请入口`），工作区无未提交修改。
- 服务器的 `origin` 和 `gitee` 均指向 `https://gitee.com/youtao19/SceneLex.git`。
- 检查时 Gitee 的 `main`、`production` 分支均指向上述提交。
- 生产环境配置文件：`/root/SceneLex/ecosystem.config.cjs`。
- 当前默认 AI 提供商：DeepSeek；视觉 OCR 提供商：Kimi。
- 数据库连接、模型密钥及用户密钥加密配置由 PM2 环境变量提供。本文只记录配置位置，不记录凭据明文。

### 本次验证范围

- PM2 的 `scenelex` 为 `online`，自动重启开启；Nginx 和 PostgreSQL 服务运行正常。
- Nginx 配置检查通过，域名请求转发至 `http://127.0.0.1:3003`。
- 服务器本机和公网的 `/health` 返回 HTTP 200，响应为 `{"success":true,"message":"backend is running"}`。
- 服务器本机和公网首页返回 HTTP 200；本次没有核对首页响应体、前端资源加载或完整页面交互。
- 未验证登录、单词生成、OCR、头像上传等完整业务流程。
- 本次只读检查，没有更新代码、构建或重启服务。本地尚未提交的修改没有部署到服务器。

## 登录服务器

```bash
ssh root@<origin-ip-removed>
cd /root/SceneLex
```

## 更新代码并重启服务

部署步骤是：备份数据库 → 从 Gitee 更新代码 → 安装依赖 → 构建 → 重启 PM2 → 检查服务。

仓库现有主线约定为 `main`，旧的 `production` 分支已冻结。上面的服务器快照仍为 `production`；下面命令显式切换到 `main`，这次文档更新没有执行分支切换。

先登录服务器并检查工作区；如果有未提交修改，先确认其用途，不要直接覆盖：

```bash
cd /root/SceneLex
git status
```

**先备份数据库并确认命令成功，再继续发布。** 本地正在开发的迁移机制会在后端启动时执行未应用的迁移，不能把它当成本次已部署的功能：

```bash
set -o pipefail
mkdir -p /root/backups
sudo -u postgres pg_dump scenelex_db | gzip > /root/backups/scenelex_db-$(date +%F-%H%M).sql.gz
```

工作区干净、备份成功后，在 Bash 中执行；任何一步失败都应停止后续步骤：

```bash
set -e
cd /root/SceneLex
git fetch gitee main
git switch main
git pull --ff-only gitee main
npm install
npm run build
pm2 restart scenelex
pm2 save
```

重启后按下面顺序检查：

```bash
pm2 status
pm2 logs scenelex --lines 50 --nostream
sh ./scripts/check-health.sh http://127.0.0.1:3003
sh ./scripts/check-health.sh https://scenlex.cn
```

若本次发布已包含迁移机制，检查日志中的 `[migrate]` 输出；迁移失败时后端不会启动。先定位失败原因。需要回滚时，确认对应迁移支持回滚，并为手动 CLI 提供生产 `DATABASE_URL` 等配置，再执行 `npm --prefix backend run migrate:down`。普通 npm 命令不会自动继承 PM2 中的环境变量。

`scripts/check-health.sh` 在本次检查时属于本地未提交内容；只有随代码发布到服务器后才能使用。

`check-health.sh` 的预期输出：

```
检查目标: https://scenlex.cn
✅ /health 正常，首页返回 HTML
```

它校验 `/health` 的响应字段和首页的 `Content-Type: text/html`。通过检查仅代表服务入口可用，还需要在浏览器验证页面加载和本次修改涉及的业务流程。

也可以直接 curl：

```bash
curl http://127.0.0.1:3003/health
curl https://scenlex.cn/health
```

正常结果应该包含：

```json
{"success":true,"message":"backend is running"}
```

## 如果修改了环境变量

生产环境变量在服务器的 PM2 配置文件中：

```bash
/root/SceneLex/ecosystem.config.cjs
```

修改这个文件后，需要指定配置文件重新加载，并用 `--update-env` 更新环境变量；仅按应用名重启不会重新读取文件中的修改：

```bash
cd /root/SceneLex
pm2 restart ecosystem.config.cjs --only scenelex --update-env
pm2 save
```

注意：`ecosystem.config.cjs` 里包含数据库密码和模型 API Key，不要提交到 git。

头像使用 Cloudflare R2 时，需要在 `ecosystem.config.cjs` 中配置：

```js
R2_AVATAR_PUBLIC_BASE_URL: 'https://avatars.scenlex.cn',
R2_AVATAR_UPLOAD_URL: 'https://avatar-upload.scenlex.cn',
R2_AVATAR_UPLOAD_TOKEN: 'Worker upload token',
```

项目现有 R2 方案使用 `scenelex-avatars` bucket，bucket 绑定在 Cloudflare Worker 上，后端只调用 Worker 上传入口。本次没有验证 Worker、bucket 或上传功能的运行状态。

如果这些变量全部留空，头像会继续保存到服务器本地 `backend/uploads/avatars`。如果只配置了一部分，后端会拒绝头像上传，避免文件写到错误位置。

## 第一次启动或重新注册 PM2 应用

如果 PM2 里没有 `scenelex` 这个应用，可以重新注册：

```bash
cd /root/SceneLex
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

确认 PM2 开机自启：

```bash
systemctl status pm2-root
```

## 查看运行状态和日志

查看 PM2 状态：

```bash
pm2 status
pm2 describe scenelex
```

查看日志：

```bash
pm2 logs scenelex --lines 100
```

只看错误日志：

```bash
tail -n 100 /root/.pm2/logs/scenelex-error-0.log
```

只看普通输出：

```bash
tail -n 100 /root/.pm2/logs/scenelex-out-0.log
```

## Nginx 操作

SceneLex 的 Nginx 配置文件：

```bash
/etc/nginx/sites-available/scenlex
```

配置生效入口：

```bash
/etc/nginx/sites-enabled/scenlex
```

修改 Nginx 后，先检查配置：

```bash
nginx -t
```

检查通过后重载：

```bash
systemctl reload nginx
```

查看 Nginx 状态：

```bash
systemctl status nginx
```

### HTTPS 证书

Nginx 使用 Let's Encrypt 证书，证书路径为：

```text
/etc/letsencrypt/live/scenlex.cn/fullchain.pem
/etc/letsencrypt/live/scenlex.cn/privkey.pem
```

本次核实证书到期时间为 2026-12-10 02:50:09 UTC（北京时间 10:50:09），`certbot.timer` 已存在并安排定时执行；定时器存在不代表未来续期一定成功。

查看证书有效期和续期任务：

```bash
openssl x509 -in /etc/letsencrypt/live/scenlex.cn/fullchain.pem -noout -dates
systemctl list-timers certbot.timer --all
```

## 数据库连接

生产服务通过 `DATABASE_URL` 连接本机 PostgreSQL：

```text
postgresql://USER:PASSWORD@127.0.0.1:5432/scenelex_db
```

其中：

- 数据库服务：PostgreSQL 16
- 监听地址：`127.0.0.1:5432`
- 数据库名：`scenelex_db`
- 连接配置来源：`/root/SceneLex/ecosystem.config.cjs`

查看 PostgreSQL 状态：

```bash
systemctl status postgresql
```

查看数据库列表：

```bash
sudo -u postgres psql -Atc "select datname from pg_database where datistemplate=false order by datname;"
```

查看 SceneLex 表：

```bash
sudo -u postgres psql -d scenelex_db -Atc "select tablename from pg_tables where schemaname='public' order by tablename;"
```

## 管理员账号过期策略

管理员账号不再因为 `access_expires_at` 到期而失去登录和后台访问权限。若需要禁用管理员，请使用 `npm run user:suspend -- --email <邮箱>` 或直接把 `access_status` 设置为 `suspended`。

## 常见问题排查

如果页面打不开，先检查：

```bash
pm2 status
systemctl status nginx
curl http://127.0.0.1:3003/health
curl https://scenlex.cn/health
```

如果 `127.0.0.1:3003/health` 不通，优先看后端日志：

```bash
pm2 logs scenelex --lines 100
```

如果本机 health 通，但域名不通，优先看 Nginx：

```bash
nginx -t
systemctl status nginx
```

如果接口报数据库错误，检查 PostgreSQL 和连接配置：

```bash
systemctl status postgresql
sudo -u postgres psql -d scenelex_db -Atc "select 1;"
```

该 SQL 只能确认本机管理员连接可用，不能代替应用账号的连接验证。应用连接配置需在服务器上核对 `ecosystem.config.cjs`，不要输出完整 `DATABASE_URL` 或把数据库密码、API Key 粘贴到聊天、issue 或提交记录里。

## 本地开发命令

本地开发不是 PM2，而是使用 npm 脚本：

```bash
npm run install:all
npm run dev
```

只启动前端：

```bash
npm run dev:frontend
```

只启动后端：

```bash
npm run dev:backend
```

生产构建命令：

```bash
npm run build
```
