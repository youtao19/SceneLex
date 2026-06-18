# SceneLex 服务器操作文档

本文档记录 SceneLex 在服务器 `47.100.94.202` 上的实际运行方式，以及更新代码后的重启步骤。

## 服务器信息

- 登录用户：`root`
- 项目目录：`/root/SceneLex`
- 对外域名：`https://scenlex.cn`、`https://www.scenlex.cn`
- 后端端口：`3003`
- 进程管理：PM2
- 反向代理：Nginx
- 数据库：本机 PostgreSQL 16

## 当前运行链路

请求链路如下：

```text
用户浏览器
-> Cloudflare
-> Nginx 443
-> http://127.0.0.1:3003
-> Express 后端
```

Express 后端同时负责两件事：

- `/api/*`：处理后端 API 请求。
- 非 API 页面：读取 `frontend/dist`，返回前端打包后的 Vue 页面。

## 登录服务器

```bash
ssh root@47.100.94.202
cd /root/SceneLex
```

## 更新代码并重启服务

如果服务器上的代码是通过 git 管理，按下面步骤更新：

```bash
cd /root/SceneLex
git status
git fetch gitee production
git pull --ff-only gitee production
npm install
npm run build
pm2 restart scenelex
```

重启后检查服务：

```bash
pm2 status
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

修改这个文件后，需要用 `--update-env` 让 PM2 重新读取环境变量：

```bash
cd /root/SceneLex
pm2 restart scenelex --update-env
pm2 save
```

注意：`ecosystem.config.cjs` 里包含数据库密码和模型 API Key，不要提交到 git。

头像使用 Cloudflare R2 时，需要在 `ecosystem.config.cjs` 中配置：

```js
R2_AVATAR_PUBLIC_BASE_URL: 'https://avatars.scenlex.cn',
R2_AVATAR_UPLOAD_URL: 'https://avatar-upload.scenlex.cn',
R2_AVATAR_UPLOAD_TOKEN: 'Worker upload token',
```

当前 R2 bucket 是 `scenelex-avatars`，bucket 绑定在 Cloudflare Worker 上，后端只调用 Worker 上传入口。

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

## 数据库连接

生产服务通过 `DATABASE_URL` 连接本机 PostgreSQL：

```text
postgresql://peach:***@127.0.0.1:5432/scenelex_db
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
pm2 env 0 | grep DATABASE_URL
```

不要把完整数据库密码或 API Key 粘贴到聊天、issue 或提交记录里。

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
