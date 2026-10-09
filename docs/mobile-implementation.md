# 移动首版实施对照（开发中）

依据：根目录 `SPEC.md`。本文记录代码核对和待实现契约，不表示接口已经实现或验收通过。

## 已核对的功能入口

路径为业务路由（部署时带 `/api` 前缀）。管理员接口不迁移到移动端。

| 用户能力 | 现有入口 | 移动端 / 共享能力缺口 |
| --- | --- | --- |
| 注册、登录、资料、头像、退出 | `auth.routes.ts`：`/auth/register`、`/login`、`/me`、头像上传、`/logout` | 原生 Cookie 收发、安全存储、启动/恢复校验、账号隔离需实现与验证 |
| 词典查询、词卡生成/重新生成 | `/words/lookup`、`/words/generate` | 完整教学字段映射、生成操作关联及结果查询 |
| 保存词卡、复习及撤销 | `/word/add`、`/today`、`/review`、`/review/rollback` | 共享学习日、原子首次完成、版本检查、幂等回执、服务端撤销依据 |
| 已保存词与历史 | `/history` | 手机列表/详情与概览；不能将网络失败当空数据 |
| 系统词书 | `/system-word-books`、`/:bookId` | 共享选书、有序未学词、跨书去重、恢复位置校验 |
| 个人单词本 | `/word-books`、`/:bookId`、`/:bookId/words/:wordId` | 创建/改名/删除/移除及保存时归属完整迁移 |
| 学习设置 | `/settings/learning` | 当前类型仅复习限制；新增新词目标、当前系统词书，不能混用两个限制 |
| 模型端点 | `/settings/endpoints` 与测试、默认端点子路由 | 手机增删改、预设、测试、权限/视觉可用状态；不读取已有密钥明文 |
| 文章 | `/reading/articles`、`/:articleId`、`/:articleId/title` | 列表、文本导入、改标题、删除、阅读；文章创建需防重复 |
| 阅读查词与翻译 | `/reading/word`、`/reading/sentence` | 底部释义、选句操作、加入词本、手动 TTS |
| 助手会话与历史 | `/reading/assistant-chats`、`/:chatId/messages`、`/messages/stream` | POST SSE、文章/句子模式、阅读位置、操作结果核实、断流不能判成功 |
| 图片识别 | `POST /ocr`，单个 `image` | 原图批次、逐页结果/重试、排序合并、私有存储、授权及 TTL |
| 本地设备能力 | `mobile/` Flutter 脚手架（仅离线语音筛选与真机探针） | 离线 en-US TTS、拍照/相册、提醒/完成通知、临时文件清理 |

## 用户端点清单（现有，挂载前缀 `/api`）

管理员路由（`/admin/*`）不迁移到移动端，不在下表。认证、访问期与限流中间件已由 `/api` 下的分组统一挂载。

| 端点 | 用途 | 移动端首版 | 实施前需先处理 |
| --- | --- | --- | --- |
| `POST /auth/register`、`/login`、`/logout` | 注册、登录、退出 | 需要 | 原生收发 `Set-Cookie`（探针已验证真机可行） |
| `GET /auth/me`、`PATCH /auth/me`、`POST /auth/me/avatar` | 资料与头像 | 需要 | 头像沿用现有限制；启动时校验会话 |
| `POST /words/lookup`、`/words/generate` | 查词、生成词卡 | 需要 | 生成结果的关联与查询 |
| `POST /word/add` | 保存词卡 | 需要 | 与移动端“完成新词”的口径映射 |
| `GET /word/today` | 今日待学/待复习 | 需要 | 改为共享学习概览（新词目标、当前词书、总到期数） |
| `GET /word/overview`（新增） | 学习日、新词目标/完成数、当前词书、到期总数、受限队列 | 需要 | 已实现（`learning-backend`） |
| `GET /word/new`（新增） | 按词书顺序取未学新词，跨书去重 | 需要 | 已实现 |
| `POST /word/complete-new`（新增） | 原子完成新词（保存词卡 + 首次评分 + 当日计数） | 需要 | 已实现 |
| `POST /word/review`、`/word/review/rollback` | 评分、撤销 | 需要 | 幂等、版本校验、服务端撤销依据 |

| `GET /history` | 已保存词与概览 | 需要 | 网络失败不能当空数据 |
| `GET /system-word-books`、`/:bookId` | 系统词书 | 需要 | 有序未学词、跨书去重 |
| `GET/POST /word-books`、`GET/PATCH/DELETE /word-books/:bookId`、`DELETE /word-books/:bookId/words/:wordId` | 个人单词本 | 需要 | 创建/改名/删除/移除全量迁移 |
| `GET/PATCH /settings/learning` | 学习设置 | 需要 | 新增每日新词目标与当前词书，复习限制独立 |
| `GET/POST /settings/endpoints`、`PATCH/DELETE /:endpointId`、`POST /:endpointId/test`、`POST /:endpointId/default`、`POST /settings/endpoints/test` | 模型端点 | 需要 | 不读取已有密钥明文；视觉/系统端点可用状态 |
| `GET/POST /reading/articles`、`DELETE /:articleId`、`PATCH /:articleId/title` | 文章 | 需要 | 创建防重复 |
| `POST /reading/word`、`/reading/sentence`、`/reading/chat` | 阅读查词/翻译/问答 | 需要 | `/reading/chat` 与流式入口的关系需在实施时对齐 |
| `GET/POST /reading/assistant-chats`、`GET /:chatId/messages`、`POST /:chatId/messages`、`POST /:chatId/messages/stream` | 助手会话与流式回复 | 需要 | 仅 `done` 才算完成；断流可识别（探针已验证） |
| `POST /ocr`（单图 `image`） | 图片识别 | 需要 | 网页继续用；移动端改走批次接口 |
| `POST /ocr/batches`（新增） | 开识别批次（操作 ID 去重） | 需要 | 已实现（`operation-ocr-backend`） |
| `GET /ocr/batches/:batchId`（新增） | 查批次与逐页状态（断线后查已有结果） | 需要 | 已实现 |
| `POST /ocr/batches/:batchId/pages/:pageIndex`（新增） | 逐页上传并识别（20 MB/张） | 需要 | 已实现 |
| `POST .../pages/:pageIndex/retry`、`/skip`（新增） | 只重试失败页、明确跳过 | 需要 | 已实现 |
| `POST /ocr/batches/:batchId/article`（新增） | 按页序合并保存文章（防重） | 需要 | 已实现 |
| `DELETE /ocr/batches/:batchId`（新增） | 取消并立刻删原图 | 需要 | 已实现 |
### 2026-10-09 多页 OCR 后端交付（`operation-ocr-backend`）

- 迁移 `1791443876524_ocr_batches.cjs`：`ocr_batches`（批次状态、`article_id`、上传时写死的 `expires_at`）
  与 `ocr_pages`（`page_index`、状态、正文、错误、私有原图相对路径、字节数）；隔离临时库已验证 up→down→up。
- 限制只保留一份：`ocr-rules.ts` 里 10 张 / 20,000,000 字节每张 / 200,000,000 字节每批 / 24 小时 TTL；
  真实图片类型只看文件头，不信 multipart 里的 MIME。
- 原图存后端私有目录 `data/ocr-tmp`（已忽略入库），不进公共静态目录；保存文章或取消即删，
  启动时清一次过期批次（不做后台常驻任务，符合 SPEC 第 9.1 节）。
- 合并只取成功页、按 `page_index` 排序拼接，跳过页不参与；全空时拒绝保存，不造文章。
- 单页失败记在页状态上（不抛整体错误），已成功页重试返回 409，避免重复调用模型。
- 验证：规则单测 10 个；隔离临时库 13 个用例（去重、用户隔离、重试/跳过、有序合并与文章防重、
  成功/取消删原图、过期批次连行带图清掉、过期后拒绝上传）；`npm run verify` 退出码 0。
- 未开始：客户端上传/多页排序/失败页替换的 Flutter 实现，以及真实多模态模型对 20 MB 原图、
  方向、格式的兼容性（需真实端点与真机）。

### 2026-10-09 学习规则后端交付（`learning-backend`）

- 迁移 `1791443876523_learning_day_and_study_operations.cjs`：学习设置加 `daily_new_word_target`（0–200）与 `current_system_book_id`；
  `words` 加 `study_version`、`first_learned_at`（老数据回填为 `created_at`）；新建 `study_operations`（操作回执 + 评分前排期）。
  已在本地临时 PostgreSQL 17 验证 up → down → up 可重复，201 被 check 拒、不存在的词书被外键拒、删词书置空。
- 学习日统一走 `LEARNING_DAY_SQL`：复习队列、到期计数、归档统计、归档页判断、插入词卡默认到期日；全仓已无 `CURRENT_DATE` 业务用法。
- 新接口：`GET /word/overview`、`GET /word/new`、`POST /word/complete-new`；
  `POST /word/review` 接受 `operationId`/`expectedVersion`，`POST /word/review/rollback` 改为只认 `targetOperationId`。
- 网页已同步适配：评分带操作 ID 与版本、撤销改回传服务端操作引用、设置页加新词目标与当前词书。
- 口径确认：**PC“保存单词”与移动端“完成新词”都算首次完成**（沿用“保存即已学”），两者都会计入当日新词完成数；
  重复完成同一个词不再计数、不再评分；撤销首次完成会把计数收回但保留词卡（收藏不丢）。
- 验证：`npm test` 98 通过 / 15 跳过（数据库用例默认跳过）；隔离临时库 `RUN_DB_TESTS=1` 另跑 15 个事务用例全通过；`npm run verify` 退出码 0。
- 尚未验证：真机/浏览器上的双端并发与重试（归后续任务）；生产库未执行任何迁移。

- `backend/src/routes/review.routes.ts` 存在但**未被任何地方挂载**（`routes/index.ts` 里没有它），属于死代码；移动端不依赖它，实施时由 `learning-backend` 决定删除还是正式挂载。
- `GET /word/today` 同时承载“新词”与“复习”入口，移动端概览需要在后端新增能力，不能只靠前端拼凑。

## 已验证的代码差距

- `backend/src/types/word.ts` 的评分请求只有 `wordId/rating`；撤销请求直接携带排期快照；`StoredWord` 没有学习版本。→ **已改**：评分带 `operationId/expectedVersion`，撤销只带 `targetOperationId`，`StoredWord` 有 `studyVersion/firstLearnedAt`。
- `word.service.ts` 评分先读取再更新，未将读取与排期写入包在同一事务；撤销仍信任客户端快照。→ **已改**：行锁 + 单事务，撤销以服务端 `study_operations.before_state` 为依据。
- `word.repository.ts` 到期判断和新排期使用 `CURRENT_DATE`；需统一为北京时间减 4 小时的学习日，不整体重排历史日期。→ **已改**：复习队列、归档统计、归档页判断和插入默认值都走学习日；历史日期字段未改。
- `upload.middleware.ts` OCR 使用内存存储、5 MiB 限制、MIME 筛选；不能仅把限制提高到 200 MB，需逐页受限文件上传和实际类型验证。头像继续保持现有限制。
- `frontend/src/services/reading.service.ts` 支持 `user_message/delta/done/error`，但响应结束未收到 `done` 时仍可正常返回；需显式判定异常结束。
- `word.service.ts` 模型 JSON 解析失败会记录原始模型输出，后续安全审计需去除可能泄露内容的日志。

## 待实现的契约原则

> 2026-10-09 状态：第 1、2、3、4、5 条已由 `learning-backend` 实现并有隔离库测试；
> 第 6–9 条（OCR 限制、临时原图 TTL、AI 回执、SSE 完成判定）仍待 `operation-ocr-backend` 与后续任务。

具体 URL、字段和保留期在对应实施步骤补齐并用 API 测试固定；以下不是已发布接口。

1. 学习概览分别提供学习日、新词目标/完成数、当前词书、总到期数与受限队列数。目标 0～200，默认 20；复习限制独立。
2. 新词完成在同一事务中保存词卡、首次评分及计数；预览不计数。已有个人词继续按已学处理。撤销首次完成不得误删收藏信息。
3. 写入使用用户作用域内稳定操作 ID；同 ID 同内容返回原结果，同 ID 不同内容拒绝。查结果不触发重新执行。
4. 评分检查预期学习版本；撤销指向服务端原操作并检查仍是最新有效版本。教学内容/词书归属不参与排期回滚。
5. 网页评分和撤销同步升级；旧快照撤销不能作为兼容绕过口。兼容窗口须明确旧客户端的安全失败行为。
6. OCR 限制为 10 张、每张 20,000,000 bytes、批次 200,000,000 bytes；页身份和用户确认顺序独立于完成顺序。只重试失败页，保存文章失败复用已识别正文。
7. 临时原图私有、按用户授权，上传起 24 小时硬 TTL；成功/取消提前清理。不得删除相册源文件，不保证模型商同步删除。
8. AI 回执仅核实已有结果，不引入请求之外的持久 worker。结果不确定时明确重复费用风险，不自动重放。
9. SSE 仅服务端确认保存完成后视为完成；HTTP 成功、EOF、部分文本均不足以证明完成。

## 兼容性策略（后端改动必须同时满足）

1. **只加不改**：新增字段/端点保持现有字段语义不变；`/word/review`、`/word/review/rollback`、`/word/today` 在网页升级完成前不能被替换掉。
2. **旧客户端的安全失败行为**：评分请求在过渡期允许缺少操作 ID（记为 legacy，无幂等保证，日志留标记）；撤销请求缺少服务端操作引用时**直接拒绝**并要求刷新，因为信任旧快照会覆盖另一端的新进度，比暂时不可用更严重。
3. **网页同步升级**：评分/撤销入口必须与后端同版本发布，否则只有 App 受保护，多端一致性并不成立。
4. **学习日迁移口径**：历史日期字段值不重排、不改写；只有新写入的到期判断与排期使用北京时间 04:00 学习日。迁移只加字段/索引，不改历史数据。
5. **历史已学口径**：保留“个人 `words` 中存在即视为已学”，不让老用户重学全部历史词；新词完成只对首次成功完成计数。
6. **上线顺序**：兼容性后端/迁移 → 网页更新 → APK；APK 不强制升级，旧 APK 在兼容窗口内继续可用。
7. **操作回执**：客户端操作 ID 在用户作用域内唯一，同 ID 同内容返回原结果、同 ID 不同内容拒绝；查询已有结果不触发重新执行，也不形成自动离线写入队列。

## 验收证据映射（对应 SPEC.md 第 15 节）

状态只有三种：**未开始**、**部分**（有下层证据但不满足整条）、**通过**（附证据）。模拟器和回环服务器不算真机证据。

### 产品闭环

| 验收项 | 证据形式 | 状态 |
| --- | --- | --- |
| 注册/同时登录/共用数据/资料头像/端点/单词本 | Flutter 集成测试 + vivo 操作记录 | 未开始 |
| 首页共享计划与准确复习数、三种空状态 | 集成测试 + 真机截图 | 未开始 |
| 顺序学词、跨书去重、0/20/200 目标、切换词书保留进度 | 后端规则测试 + 真机 | 未开始 |
| 先揭晓后评分、成功才前进、发音/撤销/词卡详情 | 集成测试 + 真机 | 未开始 |
| 冷启动恢复位置、网页已完成/删除/切账号不恢复过期位置 | 集成测试 + 双端操作 | 未开始 |
| 拍照/相册、多页排序、失败页处理、合并后直接阅读 | 真机操作记录 | 未开始 |
| 文章/查词/翻译/助手历史/流式回复逐项对照 | 集成测试 + 真机 | 未开始 |

### 时间与并发

| 验收项 | 证据形式 | 状态 |
| --- | --- | --- |
| 03:59:59 / 04:00:00 边界、时区变化不影响学习日 | 后端单元测试（注入时间） | 部分（`learning-day.test.ts` 5 个用例覆盖边界、跨年、同一时刻不同时区写法；真机改时区未做） |
| 改目标/跨日保持页面/网页改词书后刷新一致 | 后端测试 + 双端操作 | 部分（设置只更新提交字段、词书校验有隔离库用例；双端同时操作未验） |
| 双击评分、响应丢失重试不重复计数；版本冲突不覆盖 | 后端契约测试 + 真机重试 | 部分（隔离库覆盖同 ID 重放、同 ID 异内容 409、过期版本 409；真机重试未做） |
| 撤销只影响目标操作、另一端修改后拒绝、旧入口不能绕过 | 后端契约测试 + 网页适配 | 部分（隔离库覆盖撤销恢复、跨端改动后 409、旧快照 409；网页已在代码层适配但未在浏览器/真机验证） |

### 网络与设备

| 验收项 | 证据形式 | 状态 |
| --- | --- | --- |
| 飞行模式下已展示单词可用本地美式语音；冷启动不能离线学词 | vivo 真机 + 飞行模式操作记录 | 未开始（已枚举真机语音：默认引擎无 en-US 语音，听感未验证） |
| 缺失语音包提示真实可操作、不静默联网 | 真机截图 + 代码检查 | 未开始 |
| 无网拍照仅临时预览、恢复网络不自动上传、退出提醒 | 真机操作记录 | 未开始 |
| 切后台/锁屏尽力执行；强杀不承诺；回来检查结果不重复付费调用 | 真机 + 日志（操作 ID） | 未开始 |
| 流式回复异常结束不显示为完整答案 | 集成测试 | 部分（回环探针已验证 EOF 无 `done` 可识别，端到端未做） |

### 图片与隐私

| 验收项 | 证据形式 | 状态 |
| --- | --- | --- |
| 10/11 张、单图 20 MB、批次 200 MB 双端校验 | 后端边界测试 + 客户端测试 | 部分（服务端规则单测覆盖边界与文件头；客户端未实现） |
| 不自动压缩/缩放、大图失败不降质 | 上传字节比对（哈希/大小）+ 真机 | 未开始（客户端上传链未实现） |
| 乱序返回按页序合并、成功页不重复识别 | 后端测试 + 集成测试 | 部分（隔离库覆盖乱序合并、跳过页、成功页重试 409） |
| 无正文不造文章、保存超时不建重复文章 | 后端测试 | 部分（隔离库覆盖全空拒绝、重复保存返回同一篇） |
| 原图成功即删、失败/取消不超 24 小时、他人不可读 | 后端测试 + 存储检查 | 部分（隔离库覆盖成功/取消删图、过期清理、跨用户 404；真实服务器部署未验） |
| 首次说明第三方模型处理；通知/日志/存储不泄露 | 真机截图 + 日志审查 | 部分（安全存储磁盘为密文已验证；OCR 日志与说明未做） |

### 通知与发行

| 验收项 | 证据形式 | 状态 |
| --- | --- | --- |
| 20:00 提醒可改/可关；今日完成取消但后续仍提醒 | 真机通知记录 + 集成测试 | 部分（权限/开关/排期与立即通知已在 vivo 实测；定时通知在预定时间后 2 分钟内未到，待复测） |
| 仅网页完成导致旧状态提醒属已接受限制 | 双端操作记录 | 未开始 |
| 三类完成通知及跳转；拒绝权限后核心功能可用 | 真机操作记录 | 未开始 |
| vivo 省电/锁屏下实际通知表现，不宣称准时 | 真机记录（含系统版本/构建号） | 部分（已记下“定时未到 + 息屏冻结进程”两个现象；待日常使用状态复测） |
| 签名 APK 安装与覆盖升级、签名文件不入库 | vivo 安装记录 + `git check-ignore` | 未开始（需用户确认签名保管方案） |

### 工程验证

| 验收项 | 证据形式 | 状态 |
| --- | --- | --- |
| `npm run verify` 通过；测试不依赖生产数据库 | 命令输出（退出码 0） | 通过（2026-10-09：双端类型检查、前端 10 / 后端 75 测试、双端构建） |
| `mobile/` 下 analyze / test / `build apk --release` 通过，关键流程有集成测试或真机证据 | 命令输出 + 集成测试 | 部分（analyze 无问题、3 个单测通过、release 43.5 MB；学习/拍照/阅读流程未开始） |
| 后端覆盖学习日、幂等、撤销冲突、计数、图片限制与清理 | 后端测试 | 部分（学习日、幂等、撤销冲突、计数已覆盖；图片限制与清理未开始） |
| Flutter 覆盖会话、状态恢复、断流、失败页合并、提醒、TTS 缺失 | Flutter 测试 | 部分（会话持久化与断流已在真机验证；其余未开始） |

## 环境预检与待确认事项

- 已运行 `fvm install`、`fvm use --force --skip-pub-get` 和 `fvm flutter --version`：Flutter 3.47.7 stable / Dart 3.13.5，根目录 SDK 链接完成；未修改全局 SDK/PATH。插件兼容性尚未验证。
- 用户已确认应用 ID 为 `cn.scenlex.app`。
- 已通过 ADB 和 Flutter 识别 vivo V2362A（PD2362）：Android 16 / API 36，构建号 `PD2362B_A_16.2.12.0.W10`，`ro.vivo.os.version=16.0`。
- 系统默认 TTS 为 `com.vivo.aiservice`；2026-10-09 真机探针结果：设备上 TTS 引擎只有 `com.vivo.aiservice` 和 `com.tencent.qqlive`（腾讯视频附带），引擎声称 `isLanguageAvailable('en-US') = true`、`setLanguage('en-US')` 返回 1，但语音列表里英文只有不带地区的 `en`，没有 `en-US`；按当前“必须有明确 en-US 离线语音”的筛选结果为 null，只靠元数据无法确认美式口音，飞行模式听感也未实测。
- `fvm flutter doctor -v`：Android SDK 36.1.0、Android Studio JDK 21 可用；Android SDK 许可已全部接受。
- 已用 `fvm flutter create` 创建 `mobile/` 工程，应用 ID `cn.scenlex.app`，Android 与 iOS 工程均已生成。
- 已运行 `fvm flutter analyze`（无问题）和 `fvm flutter test`（3 个通过）。这只覆盖纯逻辑和占位页，不代表设备能力已验证。
- 首次 Android 构建卡在下载 Android NDK，安装 NDK r28c（`28.2.13676358`，Flutter 默认版本）后构建通过：`app-debug.apk` 151 MB、`app-release.apk` 43.1 MB（release 目前还是模板的 debug 签名，不能用于分发）；之后增量构建约 10 秒。
- 真机 TTS 探针已在 vivo V2362A 上跑通（`integration_test/tts_probe_test.dart`），只枚举能力不自动朗读；`audibleOfflineVerified` 仍为 false，飞行模式下能否真正离线发音尚待用户点击确认。
- Xcode 安装不完整、CocoaPods 未安装：iOS 构建尚不具备条件，不影响首版仅 Android 真机验收的范围；不擅自修改系统 Xcode 配置。
- 最低系统版本、图标、签名保管及发布版本待技术验证与用户确认。
- 已运行现有 web/backend 基线 `npm run verify`，退出码 0：双端类型检查通过，前端 10 个测试、后端 75 个测试通过，双端生产构建通过。这不代表新增移动能力已通过验收。
- 未执行生产操作；账号、学习、阅读等业务功能尚未开始实现。

### 2026-10-09 会话凭据与联网权限真机验证

- 新增依赖 `flutter_secure_storage` 11.2.0（Android RSA-OAEP + AES-GCM）和 `path_provider`；插件要求 `minSdk 24`，与 Flutter 默认值一致，最低 Android 版本暂定 API 24（Android 7.0），待用户最终确认。
- `lib/core/network/session_cookie.dart` 只存后端 `sl_session`（与 `backend/src/utils/session-cookie.ts` 同名），过期就删，只向请求回传 `name=value`。
- vivo V2362A 实测（`integration_test/session_probe_test.dart` + 设备回环服务器，不碰生产账号）：
  - 首次安装后运行：`previousRunCookiePresent=false`、`savedAndReadBack=true`、`serverSawCookie=true`。
  - `am force-stop` 后重启 App（不重装）连续两次：`previousRunCookiePresent=true`，说明会话能跨进程重启保留。
  - 磁盘上 `shared_prefs/FlutterSecureStorage.xml` 是密文，看不到 Cookie 明文。
- 坑：`fvm flutter test integration_test/... -d <设备>` 跑完会卸载测试 APK，应用数据一起清空，所以无法用它验证“跨启动保留”；且 standalone 启动时 `print` 不进 logcat。跨启动验证要用 `flutter build apk --debug --target=integration_test/...` + `adb install` + 两次 `am start`，证据写进应用私有目录再用 `run-as cat` 读。
- 修复：release 包原本只继承了模板的 debug 权限，没有 `INTERNET`；已加到主 manifest，并用 `aapt2 dump permissions` 确认 `app-release.apk` 里存在。

### 2026-10-09 流式回复真机验证

- 新增依赖 `dio`（按 SPEC 建议作为 HTTP 客户端，尚未接入业务）。
- `integration_test/sse_probe_test.dart` 用设备回环服务器验证 POST + SSE：`chunksReceived=3`、`firstChunkBeforeServerFinished=true`、`sawDone=true`，说明 Dio 配 `ResponseType.stream` 在 Android 上不会把整段响应缓冲成一次。
- 同一次探针验证断流：服务端只发一段 `delta` 就关闭、没有 `done`，客户端能识别为“异常结束”而不是完整回复（对应 SPEC 第 9.1/11 节要求）。
- 未验证：本次走的是回环 HTTP。生产环境 HTTPS + 反向代理（nginx）是否缓冲流式响应尚未验证，需在真实部署上补一次。

### 2026-10-09 通知探针（部分验证，未通过项已标注）

- 新增依赖 `flutter_local_notifications` 22.3.1 和 `timezone`；该插件依赖 `java.time`，`app/build.gradle.kts` 必须开 `isCoreLibraryDesugaringEnabled` 并加 `desugar_jdk_libs:2.1.4`，否则 `:app:checkDebugAarMetadata` 直接失败。
- `integration_test/notification_probe_test.dart` 只做三件事：申请权限、立刻发一条、排一条 90 秒后的每日定时；**不在 App 内自查通知**，是否真的出现由宿主机用 `adb shell dumpsys notification` 观察。
- 已证实（vivo V2362A，Android 16）：`permissionGranted=true`、`notificationsEnabled=true`、`canScheduleExact=false`（按 SPEC 不申请精确闹钟权限）；立即通知真的出现在通知栏（`channel=probe`、`importance=4`），dumpsys 可见。
- **未证实**：90 秒后的定时通知在预定时间后 ~2 分钟内没有出现（`AlarmManager` 里确实登记了 `RTC_WAKEUP`，`windowLength≈45s`）。可能原因：inexact 窗口 + vivo 待机/省电策略（该应用此前只被 adb 启动过，待机分组很可能被限制），也可能需要用户先关闭省电限制。结论：不能宣称准时，也不能宣称已支持；真机验收时要在“用户日常使用状态”下复测。
- 插件坑：`getActiveNotifications()` 在 vivo 上**不返回**（首次探针直接挂死 10 分钟），`pendingNotificationRequests()` 也会间歇性不返回。App 内调用这类自查接口必须带超时，不能无条件等待。
- 另一个实测现象：息屏时 vivo 会冻结应用进程，探针（或任何前台请求）会停住；探针必须在亮屏下跑。

验收完成前不归档 `SPEC.md`，不将本文替代当前运行说明 `docs/mobile.md`。
