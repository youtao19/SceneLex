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

## 已验证的代码差距

- `backend/src/types/word.ts` 的评分请求只有 `wordId/rating`；撤销请求直接携带排期快照；`StoredWord` 没有学习版本。
- `word.service.ts` 评分先读取再更新，未将读取与排期写入包在同一事务；撤销仍信任客户端快照。
- `word.repository.ts` 到期判断和新排期使用 `CURRENT_DATE`；需统一为北京时间减 4 小时的学习日，不整体重排历史日期。
- `upload.middleware.ts` OCR 使用内存存储、5 MiB 限制、MIME 筛选；不能仅把限制提高到 200 MB，需逐页受限文件上传和实际类型验证。头像继续保持现有限制。
- `frontend/src/services/reading.service.ts` 支持 `user_message/delta/done/error`，但响应结束未收到 `done` 时仍可正常返回；需显式判定异常结束。
- `word.service.ts` 模型 JSON 解析失败会记录原始模型输出，后续安全审计需去除可能泄露内容的日志。

## 待实现的契约原则

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

## 验收证据安排

所有项目当前均为待验证；`SPEC.md` 第 15 节仍是完整验收清单。

| 验收组 | 所需证据 |
| --- | --- |
| 产品闭环 | 普通用户功能逐项对照，Flutter 集成测试及 vivo 操作记录 |
| 时间与并发 | 学习日边界/跨日、目标边界、操作去重、版本冲突及撤销测试；事务集成验证使用隔离测试库，不使用生产库 |
| 网络与设备 | 冷启动断网、恢复位置、账号隔离、飞行模式 en-US TTS、缺失语音、切后台/强杀、断流记录 |
| 图片与隐私 | 数量/字节边界、原图不改写、乱序/失败页/空正文/保存重试、TTL/用户隔离、日志脱敏测试 |
| 通知与发行 | vivo 实际系统/构建号、权限/省电表现、提醒跨日、三类跳转、固定签名安装及覆盖升级记录 |
| 工程 | `npm run verify`；`fvm flutter analyze`、`fvm flutter test`、`fvm flutter build apk --release` 的实际结果 |

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

验收完成前不归档 `SPEC.md`，不将本文替代当前运行说明 `docs/mobile.md`。
