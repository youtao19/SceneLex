# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run install:all          # Install dependencies for root, frontend, and backend
npm run dev                  # Start both Vite dev server (port 9003) and Express API (port 3003)
npm run dev:frontend         # Vite dev server only
npm run dev:backend          # Express API with ts-node-dev only
npm run dev:ollama           # Both apps with AI_PROVIDER=ollama
npm run dev:kimi             # Both apps with AI_PROVIDER=kimi
npm run dev:deepseek         # Both apps with AI_PROVIDER=deepseek
npm run dev:ocr              # Start PaddleOCR Python microservice (port 8001)
npm run build                # Build both frontend and backend for production
npm run start:prod           # Run compiled backend (node backend/dist/server.js)
npm run dict:download        # Download ECDICT dictionary data
npm run prewarm:cet6         # Prewarm CET-6 system word cards via AI

# User management scripts:
npm run key:create           # Create access key
npm run user:suspend         # Suspend a user
npm run user:resume          # Resume a user
npm run user:renew           # Renew user access
```

No test runner is configured. `npm run build` is the minimum verification step. Frontend proxies `/api` and `/uploads` to `http://localhost:3003` in dev mode.

## Architecture

### Backend (Express + TypeScript, CommonJS modules)

Layered pattern: **routes → controllers → services → repositories → PostgreSQL (raw SQL via `pg`)**

Key layers:
- **`routes/`** — Mounted under `/api` in `routes/index.ts`. Each route file applies relevant middleware (auth, access, rate-limit). Routes call controllers.
- **`controllers/`** — Extract request params/body, call services, send responses via `utils/response.ts` helpers.
- **`services/`** — All business logic. This is where AI calls, validation, and cross-cutting concerns live.
- **`repositories/`** — All PostgreSQL queries using `config/database.ts` (`query()`, `withTransaction()`). No ORM — raw parameterized SQL.
- **`middlewares/`** — Auth (session-based, HttpOnly cookie), access control (VIP/active users), rate limiting, model concurrency limiting, admin guard.
- **`config/`** — `env.ts` loads `.env.dev.local` (dev) or `.env` (prod). `ai.ts` defines Ollama/Kimi/DeepSeek provider configs. `database.ts` creates the pg Pool and runs `initializeDatabase()` to create all tables with `IF NOT EXISTS` + seed system word books.

Database is auto-initialized on startup. Tables include: `users`, `access_keys`, `user_sessions`, `user_learning_settings`, `user_ai_api_keys`, `words` (with Anki SM-2 SRS fields), `word_books`, `word_book_items`, `system_word_books`, `system_word_book_items`, `system_word_card_previews`, `system_word_cards`, `dictionary_entries`, `reading_articles`, `reading_assistant_chats`, `reading_assistant_messages`.

### Frontend (Vue 3 + TypeScript, ESM modules)

Standard directory layout: `views/`, `components/`, `stores/` (Pinia), `services/` (API clients), `types/`, `utils/`.

Routes: `/` (landing), `/dashboard`, `/reading` (OCR + AI assistant), `/review` (SRS), `/study-books` (CET-4/6, TEM-4/8), `/history`, `/word-books`, `/profile`, `/settings` (AI provider/keys/learning settings), `/admin`.

### AI Provider Abstraction (`backend/src/services/llm.service.ts`)

Unified dispatch via `aiConfig.provider` (Ollama | Kimi | DeepSeek). Two output modes:
- **Word card generation** (`generateWithLocalModel`): JSON output with `word`, `phonetic`, `meanings` — uses response_format JSON where supported, extracts JSON objects from raw output as fallback.
- **Plain text** (`generatePlainWithLocalModel`, `streamPlainWithLocalModel`): Free-text for reading assistant — lower temperature, shorter max_tokens.

Kimi and DeepSeek use OpenAI-compatible `/chat/completions`; Ollama uses native `/api/generate`. Users can provide their own API keys stored encrypted in `user_ai_api_keys`; server-level keys are only used as fallback for admin/system tasks (controlled by `allowServerApiKey` flag).

### OCR Pipeline

Three strategies: Tesseract (local CLI), PaddleOCR (Python microservice at port 8001 via `uv`), and vision models (Ollama multimodal or Kimi vision API, controlled by `OCR_VISION_PROVIDER`).

### Auth Flow

Session-based with HttpOnly cookies — `user_sessions` table stores token hashes. Auth middleware validates session tokens from cookies on every request. Access middleware checks `access_status` and `access_expires_at` for VIP/paid users.

## Conventions

- **Backend files**: kebab-case + role suffix (`word.routes.ts`, `error.middleware.ts`)
- **Frontend components**: PascalCase (`HomeView.vue`, `WordInput.vue`)
- **Functions/store hooks**: camelCase (`useWordStore`)
- TypeScript `strict` in both apps; avoid `any`. Frontend uses semicolons, backend mostly omits them — match the file you're editing.
- Comments explain "why", not "what"; no comments on obvious code; functions must have comments.
- `.gitignore` covers `dist/`, `node_modules/`, `.env.dev.local`, logs, coverage.

## Environment

Config lives in `backend/.env` (template) and `backend/.env.dev.local` (actual dev values, gitignored). Key variables: `PORT`, `AI_PROVIDER`, `DATABASE_URL`, `OLLAMA_BASE_URL`/`OLLAMA_MODEL`, `KIMI_API_KEY`/`KIMI_MODEL`, `DEEPSEEK_API_KEY`/`DEEPSEEK_MODEL`, `OCR_VISION_PROVIDER`, `OCR_MODEL`, `MODEL_GLOBAL_CONCURRENCY`, `MODEL_USER_CONCURRENCY`, `MODEL_RATE_LIMIT_MAX`, `MODEL_QUEUE_TIMEOUT_MS`.
