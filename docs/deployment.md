# 部署

从零把 SceneLex 放到一台新的 Linux 服务器上。

本文只写与具体机器无关的步骤。某台已上线服务器的现状记录在
[`server-operations.md`](server-operations.md)——那份是运维快照，会过期；
这份是操作手册，跟着代码走。两者内容重复时以本文为准。

## 需要什么

| 依赖 | 说明 |
|---|---|
| Linux 服务器 | 需要 root 或 sudo |
| Node.js 22+ | 本地与线上都在 22.x 上跑过 |
| PostgreSQL | 迁移里没用扩展也没用版本特有的 SQL，14 以上都行 |
| Nginx | 反向代理与 TLS 终止 |
| PM2 | 进程守护，`npm i -g pm2` |

按需安装：

- **`tesseract-ocr`** —— `tesseract` 这个方法靠外部二进制执行，而且接口在请求没带 `method` 时就是回落到它。
  网页端目前只用 `vision`，所以不装它日常也能跑；但直接调 `POST /api/ocr` 且不带 `method` 会报 `spawn tesseract ENOENT`。
- **`uv`** —— 只有要跑 `ocr-service` 这个 Python 微服务才需要。
- **Cloudflare R2** —— 只有头像要放对象存储才需要，否则存在服务器本地磁盘。

## 1. 建数据库

用专用角色，不要拿 `postgres` 超级用户跑应用：

```sql
CREATE ROLE scenelex LOGIN PASSWORD '换成你自己的口令';
CREATE DATABASE scenelex_db OWNER scenelex;
```

表结构不用手工建：后端启动时会自动执行 `backend/migrations/` 下的迁移，
然后播种内置词书。所以数据库只要有权限建表就够了。

服务只需要连本机，**不要**改 `listen_addresses` 去暴露 5432。要连线上库调试就走 SSH 隧道
（见 README 的 "Developing Against the Production Database"）。

## 2. 拉代码、装依赖

```bash
git clone <你的仓库地址> /opt/scenlex
cd /opt/scenlex
npm run install:all
```

目录放哪都行。仓库里的路径都是从文件自身位置推导的，没有写死某个绝对路径。

## 3. 配置

生产环境的配置**只能从进程环境进来**——`backend/src/config/env.ts` 只在非生产环境读
`backend/.env.dev.local`，线上不加载任何 `.env` 文件。PM2 的 `env` 块就是入口。

仓库里有一份模板：

```bash
cd /opt/scenlex
cp ecosystem.config.example.cjs ecosystem.config.cjs
```

然后填两个必填项：

- `DATABASE_URL` —— 指向第 1 步建的库
- `USER_API_KEY_SECRET` —— 任意一串够长的随机值

**`USER_API_KEY_SECRET` 上线后不要再改。** 它加密用户填的模型 API Key，换一次所有用户已保存的端点都解不开，只能重填。

其余变量（CORS、OCR、并发与限流、系统端点配额、预热脚本、R2 头像）在模板里以注释形式列着，带各自的默认值。
模板里写了两条容易踩的约束，改之前先读一遍：只能 `fork` 单实例，`NODE_ENV` 必须是 `production`。

**前后端同源部署时 `CORS_ORIGINS` 留空即可**（本文的部署形态就是同源：后端同时提供页面和 API）。
只有前端在别的域名或端口上才需要填。填错的症状值得记住：浏览器对非 GET 的请求——
包括**同源**的——也会带 `Origin`，所以站点自己的域名没被放行时，前端每次登录、保存都会失败，
看起来像后端坏了。

`ecosystem.config.cjs` 已在 `.gitignore` 里，因为它含数据库口令和模型 Key。**不要把真值写进 `*.example.cjs`**——那份是要提交的。

### 前端要单独配的一项

落地页那个「没有访问密钥？点击联系管理员」的收件地址是**构建期**变量，不在 PM2 的环境里
（PM2 的环境是运行期的，注入不进已经打包好的前端）：

```bash
# frontend/.env.local —— 已被 gitignore，不会进仓库
VITE_CONTACT_EMAIL=admin@example.com
```

也可以只在构建那一次带上：`VITE_CONTACT_EMAIL=admin@example.com npm run build`。
留空的话那个入口整块不渲染——好过显示一个收不到信的 `mailto:`，让人以为申请已经发出去了。

## 4. 构建

```bash
npm run build
```

前端产物在 `frontend/dist`，后端编译到 `backend/dist`。两者的 `dist` 都存在时，
同一个 Express 进程既提供页面也提供 `/api`，不需要额外的静态服务器。

发布前先在服务器上跑一遍门禁，和 CI 完全一致：

```bash
npm run verify    # typecheck + test + build
```

## 5. 交给 PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup      # 按它输出的提示再执行一遍那行 sudo 命令，配置开机自启
```

确认状态：

```bash
pm2 status
pm2 logs scenelex --lines 50 --nostream   # 启动时应能看到 [migrate] 输出
```

重启后先看 `[migrate]`：正常是列出执行的迁移，没有待执行时是 `No migrations to run!`。
**迁移失败时后端不会启动**，这是有意的——宁可服务不可用，也不要让线上跑在半套 schema 上。

改了 `ecosystem.config.cjs` 里的环境变量后，必须指定配置文件重载，按应用名重启不会重读：

```bash
pm2 restart ecosystem.config.cjs --only scenelex --update-env
pm2 save
```

### 不要顺手把 `instances` 调大

模板里 `instances: 1` 是硬前提，不是保守估计。限流计数、模型并发队列都在进程内存里，头像和 OCR 原图落在本机磁盘上——加实例不会分摊这些，只会让每一份配额各算各的。多实例之前必须先做的事，README 的 [Scaling past one process](../README.md#scaling-past-one-process) 列了一张表，照着改完再动这个数字。

模型用量配额（`model_usage_daily`）是例外：它存在 PostgreSQL 里，本来就在实例间共享。

## 6. 首次初始化

数据库是空的，没有账号也没有词书。按顺序做：

**(1) 建第一个管理员。** 管理接口本身要求调用者已经是管理员，所以第一个只能从脚本产生：

```bash
npm run key:create -- --days 30     # 签发一个邀请码，不需要任何管理员
# 在应用里用这个邀请码注册
npm run user:promote -- --email you@example.com
```

管理员不受账号到期限制，但仍可用 `npm run user:suspend` 显式停用。

**(2) 导入词书。** 后端首次启动只播种每本书大约十个参考词，完整词表来自这条命令：

```bash
npm run wordbook:import              # CET-6 / TEM-4 / TEM-8
npm run wordbook:import -- --book cet6   # 只导一本
```

词表随仓库提供（`backend/data/<code>-word-list.json`），不联网。重跑是安全的——每次都是先清空再写入，所以它也是把词书恢复成词表原始顺序的手段（历史版本里启动播种会覆盖导入结果，现在改成只补缺失的词，不再覆盖）。

**(3) 配系统端点（可选）。** 在 `/admin` 里配一个管理员出资的共享端点，然后把需要用它的用户标为 VIP。
没有这一步，每个用户都得自己在设置页填自己的模型端点。

**配完顺手设一下配额。** 系统端点是你出钱的，默认给每个用户每天 200 次、每月 3000 次上限，
超了会被拒绝并提示对方去填自己的端点：

```js
SYSTEM_ENDPOINT_DAILY_CALL_LIMIT: '200',     // 0 = 不限
SYSTEM_ENDPOINT_MONTHLY_CALL_LIMIT: '3000',
```

配额按**调用次数**算，不按 token：次数每次调用都确定知道，token 要看上游回不回传。
每次都带了 `max_tokens`，所以次数上限同时也就是输出 token 的上限。
统计口径是学习日（北京时间 04:00 换日），和「今天的单词」用的是同一个界。
`/admin` 的「用户授权台账」有一列「模型用量」，能看到每人今天用了多少、本月从系统端点花了多少次。

**(4) 导入词典（可选）。** 词卡查词优先走本地词典，不导入也能用，只是慢一些。

```bash
npm run dict:download
npm --prefix backend run dict:build-cache
npm --prefix backend run dict:import-db
```

**(5) 预热词卡（可选）。**

```bash
npm run prewarm:cet6
```

预热脚本没有用户身份，凭证只能从环境变量取（`PREWARM_BASE_URL` / `PREWARM_API_KEY` / `PREWARM_MODEL`，都空着则回退到 `DEEPSEEK_*`）。

## 7. Nginx 反向代理

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    # OCR 单张图片上限是 20 MB，加上 multipart 开销留一点余量。
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 阅读助手用 SSE 流式返回（text/event-stream）。开着缓冲的话
        # 整段回复会攒到最后一次性吐出来，流式就白做了。
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/scenlex /etc/nginx/sites-enabled/scenlex
nginx -t && systemctl reload nginx
```

### 让后端认得真实客户端 IP

反代之后 `req.ip` 默认是 Nginx 的地址，而登录/注册是**按 IP** 限流的（15 分钟 20 次）。
不配的话这 20 次是全站共享的：人一多大家会一起被锁死，暴力破解防护也同时失效。

在 `ecosystem.config.cjs` 里把 `TRUST_PROXY_HOPS` 设成前面代理的层数：

| 部署形态 | 值 |
|---|---|
| Cloudflare → Nginx → 后端 | `2`（默认值） |
| Nginx → 后端 | `1` |
| 后端直接对外 | `0` |

数多了同样有问题：多出来的那一跳会取自攻击者伪造的 `X-Forwarded-For`。

**数跳数的前提是后端只能经由这些代理访问到。** 如果源站能被直连，攻击者绕过 Cloudflare
自己编一个 `X-Forwarded-For` 就绕过了按 IP 的限流。所以源站防火墙要只放行
[Cloudflare 的出口网段](https://www.cloudflare.com/ips/)——这一条在应用里保证不了。

## 8. HTTPS

```bash
certbot --nginx -d example.com -d www.example.com
systemctl list-timers certbot.timer --all   # 确认自动续期已排期
```

certbot 会自己改上面的 Nginx 配置，加 443 与跳转。续期定时器存在不代表将来一定续成功，
偶尔用 `openssl x509 -in <fullchain> -noout -dates` 看一眼到期时间。

## 9. 备份

**每次发布前先备份，并确认备份命令本身成功了，再动代码。** 后端启动时会自动执行未应用的迁移，
迁移可能改动或删除数据。

```bash
set -o pipefail
mkdir -p /var/backups/scenlex
sudo -u postgres pg_dump scenelex_db | gzip > /var/backups/scenlex/scenelex_db-$(date +%F-%H%M).sql.gz
gzip -t /var/backups/scenlex/scenelex_db-*.sql.gz   # 确认不是半个文件
```

备份里含全部用户数据与加密后的端点密钥，按机密文件对待，别放进仓库或对象存储的公开桶。
`USER_API_KEY_SECRET` 也要单独留一份：它不在备份里，丢了的话备份恢复出来也解不开密钥。

## 10. 升级

```bash
set -e
cd /opt/scenlex

# 1) 备份（见上一节）

# 2) 更新代码
git fetch origin main
git switch main
git pull --ff-only origin main

# 3) 依赖变了不装会让构建或启动失败
npm install

# 4) 先在服务器上跑一遍门禁再重启
npm run verify

# 5) 重启并落盘进程列表
pm2 restart scenelex
pm2 save
```

检查：

```bash
pm2 status
pm2 logs scenelex --lines 50 --nostream     # 看 [migrate]
sh ./scripts/check-health.sh http://127.0.0.1:3003
sh ./scripts/check-health.sh https://example.com
```

`check-health.sh` 校验 `/health` 的响应字段和首页的 `Content-Type: text/html`。
通过只代表入口可用，本次改动涉及的业务流程还得在浏览器里手工验证一遍。

也可以直接 curl，正常应返回 `{"success":true,"message":"backend is running"}`：

```bash
curl http://127.0.0.1:3003/health
curl https://example.com/health
```

## 11. 回滚

代码回滚就是 `git reset --hard <上一个提交>` 后重新 `npm run build` + `pm2 restart scenelex`。

**数据库迁移不会跟着回滚。** 需要退回 schema 时，先确认那个迁移写了 `down`，再手工执行：

```bash
npm --prefix backend run migrate:down
```

这条命令不会自动继承 PM2 里的环境变量，得先给当前 shell 提供生产 `DATABASE_URL`。
拿不准就恢复备份，别猜。

## 12. 排查

按链路从内往外查：

```bash
pm2 status                                   # 进程活着吗
curl http://127.0.0.1:3003/health            # 后端自己通吗
nginx -t && systemctl status nginx           # 代理配置对吗
curl https://example.com/health              # 外部能到达吗
```

- **后端起不来**：先看 `pm2 logs scenelex`。最常见的是 `DATABASE_URL` 连不上、或迁移失败（日志里会有 `[migrate]` 的报错）。
- **本机 health 通、域名不通**：问题在 Nginx 或证书，不在应用。
- **接口报数据库错误**：`systemctl status postgresql`，再用应用角色连一次确认权限，别用 `postgres` 超级用户代测。
- **页面能开但接口 401**：会话 cookie 没带上，通常是 Nginx 没转发 `Host` 或访问的是 http 而 cookie 是 `Secure` 的。

贴日志求助前先过一遍：不要把完整的 `DATABASE_URL`、模型 API Key、用户邮箱粘到聊天、issue 或提交记录里。
