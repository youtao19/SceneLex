# WordScene

WordScene 是一个前后端分离的英语单词学习项目脚手架，包含 Vue 3 前端、Express 后端，以及按业务拆分的目录结构。

## 目录

```text
frontend/  前端应用
backend/   后端服务
docs/      项目文档
scripts/   启动和构建脚本目录
```

## 快速开始

```bash
npm run install:all
cp backend/.env backend/.env.dev.local
npm run dev
```

后端运行时读取 `backend/.env.dev.local`。`backend/.env` 只作为示例文件，改本机配置时请改 `.env.dev.local`。

## 本地模型切换

默认使用 Ollama：

```bash
npm run dev:ollama
```

切换到 oMLX：

```bash
npm run dev:omlx
```

切换到 DeepSeek API：

```bash
npm run dev:deepseek
```

也可以只启动后端：

```bash
npm run dev:backend:ollama
npm run dev:backend:omlx
npm run dev:backend:deepseek
```

后端通过 `AI_PROVIDER` 选择模型服务。`AI_PROVIDER=ollama` 会请求 `OLLAMA_BASE_URL`，`AI_PROVIDER=omlx` 会请求 `OMLX_BASE_URL` 的 OpenAI-compatible `/chat/completions` 接口，`AI_PROVIDER=deepseek` 会请求 `DEEPSEEK_BASE_URL` 的 `/chat/completions` 接口。
如果 `OMLX_API_KEY` 留空，后端会尝试读取本机 `~/.omlx/settings.json` 里的 oMLX key；也可以在 `.env.dev.local` 里显式填写。
使用 DeepSeek 前，在 `backend/.env.dev.local` 中配置 `DEEPSEEK_API_KEY`，必要时用 `DEEPSEEK_MODEL` 指定模型。

阅读页图片识别的 “多模态大模型” 不受 `AI_PROVIDER` 影响，启动时通过 `OCR_VISION_PROVIDER` 选择模型来源：`ollama` 走本地 `OCR_MODEL`，`kimi` 走 Kimi API。使用 Kimi 前，在 `backend/.env.dev.local` 中配置 `OCR_VISION_PROVIDER=kimi` 和 `KIMI_API_KEY`（或 `MOONSHOT_API_KEY`）。默认请求 `KIMI_BASE_URL=https://api.moonshot.cn/v1` 和 `KIMI_MODEL=kimi-k2.6`。

## 当前状态

- 已创建前后端基础目录结构
- 已补充最小可运行入口和分层占位文件
- 业务实现仍需继续完善
