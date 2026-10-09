# SceneLex 移动客户端（当前状态）

> 状态：**开发中，尚未验收**。本文记录当前实现、运行方式与已知限制；`SPEC.md` 仍是验收依据。
> 验收完成后 `SPEC.md` 归档到 `docs/specs/mobile-v1.md`，本文继续作为当前行为说明维护。

## 结构

`mobile/` 是 Flutter 客户端，共用 `backend/`；PC 网页保持独立。

```
mobile/lib/
├── app/           启动、路由守卫、主题、依赖组装（Riverpod providers）
├── core/          config（后端地址）、network（ApiClient/会话 Cookie/操作 ID）、
│                  storage（安全存储与设备偏好）、platform（离线 TTS）
└── features/      auth、learning、words、reading、ocr、notifications、settings、shell
```

关键约定：

- 后端统一返回 `{ code, message, data }`；`ApiClient` 只把 `data` 交给上层，并把错误收敛成
  `NetworkFailure` / `SessionExpiredFailure`(401) / `AccessDeniedFailure`(403) / `RequestFailure`。
- 会话是后端下发的 `sl_session` Cookie，存系统安全存储，请求由拦截器自动带上；登出清干净。
- 写入类接口（评分、新词完成、撤销、OCR 批次）都带客户端操作 ID，重试复用同一个值；
  评分还带 `expectedVersion`，版本不一致返回 409，不覆盖另一端的新进度。
- 发音只用系统里“已安装的离线美式语音”，没有就引导去系统安装，绝不静默走网络。
- 原图只放应用私有临时目录，不压缩不改写；服务端上传起 24 小时硬 TTL，保存文章或取消即删。

## 环境与命令

SDK 版本以根目录 `.fvmrc` 为准（Flutter 3.47.7 / Dart 3.13.5），所有命令走 `fvm`：

```bash
cd mobile
fvm flutter pub get
fvm flutter analyze
fvm flutter test
fvm flutter build apk --release          # 产物：build/app/outputs/flutter-apk/app-release.apk
```

后端与网页的工程验证仍在仓库根目录：

```bash
npm run verify        # typecheck + test + build（前端 12 个测试、后端 115 个测试）
```

### 连开发后端（真机）

```bash
adb reverse tcp:3003 tcp:3003
fvm flutter build apk --debug \
  --dart-define=API_BASE_URL=http://127.0.0.1:3003/api
```

debug 构建允许明文访问 `127.0.0.1/localhost`（`android/app/src/debug/res/xml/network_security_config.xml`），
release 仍然只走 HTTPS。默认 `API_BASE_URL` 是 `https://scenlex.cn/api`。

### 真机联调用的假模型（只用于本地验证，不要部署）

```bash
node backend/scripts/fake-model-server.cjs     # 127.0.0.1:3010，OpenAI-compatible SSE
```

配合隔离测试库里的系统端点使用；提问里带 `CUT_STREAM` 会让它故意截断流，用来验证断流分支。

## 当前行为要点

- 学习日固定北京时间 04:00；新词目标、当前词书、复习数量限制都在服务端，PC 与 App 共用。
- 新词按词书顺序取，个人 `words` 里已有即跳过（跨书去重）；完成新词＝保存词卡＋首次评分＋当日计数，
  在服务端同一事务里完成；撤销首次完成会收回计数但保留词卡。
- 专注卡片：正面只给单词与音标，揭晓后才显示完整词卡；四档评分提交期间禁用（防连点），
  服务端确认成功才前进；撤销指向服务端记录的评分操作。
- 恢复位置：复习词按个人词 id、新词按词条 id 记录，位置对不上就从头开始并清掉；按用户隔离。
- 拍照识别：最多 10 张、单张 20 MB、批次 200 MB；逐页上传、失败页可重试/换图/跳过，
  按用户确认的页序合并；全部为空不建文章。
- 阅读助手：POST SSE 逐字显示，只有收到 `done` 才算完整回答；断流保留片段并标注“未完成”。
- 通知：每日提醒（默认 20:00，可改可关，今天完成跳过今天）；三类完成通知由客户端观察完成时发出。

## 已知限制与未验证项

- **vivo 定时通知送达未证实**：inexact 定时通知在预定时间后 2 分钟内没出现，不宣称准时；
  每日提醒的排期与开关行为已验证，到点是否弹出需在用户日常使用状态下复测。
- **离线发音已按用户决定放宽**：主验收设备默认引擎只有不带地区的 `en` 离线语音，
  用户确认“en 也行”，所以现在会在没有 `en-US` 时退回 `en`（显式别的地区如 `en-GB` 仍然不选）。
  真机已验证能选中该语音并成功调用发音；**是否有声音需人工听一次**。
- 断流的设备级复现未成功（解析层分支由单测覆盖）。
- 拍照/选图的系统选择器需要人工操作，自动用例覆盖的是上传与合并链路。
- 与 PC 网页“同时登录同一账号”未在真机验证。
- iOS 未纳入首版验收。

## 真机验收待你配合的三步

1. **飞行模式发音**：打开任意词卡 → 打开飞行模式 → 点发音按钮，确认**能听到声音**
   （口音已按你的决定放宽到接受设备上的 `en`）。
2. **通知到达**：在设置页确认提醒已开启 → 等到提醒时间（或把时间改到 2 分钟后）→ 看是否弹出。
   记录是否准时、延迟多久；vivo 省电可能延迟或阻止，这属于已知风险。
3. **安装与覆盖升级**：用固定签名的 APK 安装一次，再装一次新版本号，确认能覆盖安装且登录状态保留。

## 发布注意

- 应用 ID 固定 `cn.scenlex.app`；`minSdk` 由插件决定为 24（Android 7.0），`targetSdk` 36。
- 发布签名：`android/app/build.gradle.kts` 会读本机 `android/key.properties`；
  文件不存在时退回 debug 签名（本地/CI 仍能构建验证）。密钥与口令不入库
  （`android/.gitignore` 已忽略 `key.properties`、`*.jks`、`*.keystore`）。
- 已用一次性密钥验证过签名配置生效（`apksigner verify --print-certs` 能看到自定义证书），
  正式密钥按用户决定由本人生成：

  ```bash
  keytool -genkeypair -v -keystore ~/keystores/scenlex-release.jks \
    -alias scenlex -keyalg RSA -keysize 2048 -validity 10000
  ```

  然后写 `mobile/android/key.properties`（口令存密码管理器，别提交）：

  ```
  storePassword=<口令>
  keyPassword=<口令>
  keyAlias=scenlex
  storeFile=~/keystores/scenlex-release.jks
  ```

  配好后再跑 `fvm flutter build apk --release` 即为正式签名包；换签名后必须**卸载重装一次**，
  之后同一签名的更高版本号可以覆盖安装（覆盖安装保留登录状态已用 debug 签名实测）。
- 版本号在 `mobile/pubspec.yaml` 的 `version` 字段递增。
- vivo 安装外部来源 APK 会弹「安全守护提示」，需要手动勾选风险提示再点“继续安装”。
