# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run install:all          # Install dependencies (root workspaces cover both apps)
npm run dev                  # Start both Vite dev server (port 9003) and Express API (port 3003)
npm run dev:frontend         # Vite dev server only
npm run dev:backend          # Express API with ts-node-dev only
npm run dev:ocr              # Start PaddleOCR Python microservice (port 8001)
npm run typecheck            # vue-tsc (frontend) + tsc (backend)
npm test                     # vitest, both apps
npm run build                # Build both frontend and backend for production
npm run verify               # typecheck + test + build (what CI runs)
npm run start:prod           # Run compiled backend (node backend/dist/server.js)
npm run health:check         # Assert /health + served HTML on localhost:3003
npm run health:check:prod    # Same check against https://scenlex.cn
npm run dict:download        # Download ECDICT dictionary data
npm run prewarm:cet6         # Prewarm CET-6 system word cards via AI

# Database migrations (applied automatically on startup):
npm --prefix backend run migrate:status
npm --prefix backend run migrate:up
npm --prefix backend run migrate:down

# User management scripts:
npm run key:create           # Create access key
npm run user:suspend         # Suspend a user
npm run user:resume          # Resume a user
npm run user:renew           # Renew user access
```

CI (`.github/workflows/ci.yml`) runs typecheck, test, and build on every push and pull request to `main`. `main` is the single development branch. Frontend proxies `/api` and `/uploads` to `http://localhost:3003` in dev mode.

## Architecture

### Backend (Express + TypeScript, CommonJS modules)

Layered pattern: **routes → controllers → services → repositories → PostgreSQL (raw SQL via `pg`)**

Key layers:
- **`routes/`** — Mounted under `/api` in `routes/index.ts`. Each route file applies relevant middleware (auth, access, rate-limit). Routes call controllers.
- **`controllers/`** — Extract request params/body, call services, send responses via `utils/response.ts` helpers.
- **`services/`** — All business logic. This is where AI calls, validation, and cross-cutting concerns live.
- **`repositories/`** — All PostgreSQL queries using `config/database.ts` (`query()`, `withTransaction()`). No ORM — raw parameterized SQL.
- **`middlewares/`** — Auth (session-based, HttpOnly cookie), access control (active users), rate limiting, model concurrency limiting, admin guard.
- **`config/`** — `env.ts` loads `.env.dev.local` (dev) or `.env` (prod). `endpoint-presets.ts` holds the DeepSeek/Kimi/Ollama presets and the trusted-URL list used by the SSRF guard. `database.ts` owns the pg Pool, `query()`/`withTransaction()` helpers, and `initializeDatabase()`. `migrations.ts` wraps the `node-pg-migrate` runner.

### Database migrations

All DDL lives in `backend/migrations/` as timestamped `.cjs` files using `pgm.sql()`; that directory must contain nothing else, because the runner tries to load every file in it. `initializeDatabase()` runs `runMigrations()` and then seeds the built-in word books — it must never contain DDL again. Migrations run in a single transaction with a `wait` advisory lock, so overlapping PM2 restarts are safe; a failing migration deliberately prevents the server from starting. `node-pg-migrate` v9 is ESM-only, so it is imported dynamically from the CommonJS backend. See `docs/database-migrations.md`.

`MIGRATE_ON_STARTUP` gates startup migrations: default on, only an explicit `false` disables them, and the server must never set it. Local development reaches the production database through an SSH tunnel (`npm run dev:db-tunnel`, local port 5433) and sets `MIGRATE_ON_STARTUP=false` in `backend/.env.dev.local` so undeployed migrations cannot reach production.

Tables include: `users`, `access_keys`, `user_sessions`, `user_learning_settings`, `user_ai_api_keys`, `words` (with Anki SM-2 SRS fields), `word_books`, `word_book_items`, `system_word_books`, `system_word_book_items`, `system_word_card_previews`, `system_word_cards`, `dictionary_entries`, `reading_articles`, `reading_assistant_chats`, `reading_assistant_messages`.

### Frontend (Vue 3 + TypeScript, ESM modules)

Standard directory layout: `views/`, `components/`, `stores/` (Pinia), `services/` (API clients), `types/`, `utils/`.

Routes: `/` (landing), `/dashboard`, `/reading` (OCR + AI assistant), `/review` (SRS), `/study-books` (CET-4/6, TEM-4/8), `/history`, `/word-books`, `/profile`, `/settings` (AI provider/keys/learning settings), `/admin`.

### Model Endpoints (`backend/src/services/llm-client.ts`)

Every model call goes to an OpenAI-compatible `/v1/chat/completions` on an endpoint the user configured (`user_ai_endpoints`: base URL, encrypted key, model, optional vision model). There is no server-side fallback key and no global provider switch — `aiConfig` and the `AI_PROVIDER` env var are gone.

`llm-client.ts` is the only outbound client and always fetches through `safeFetch` from `utils/ssrf-guard.ts`, which resolves DNS before validating the resolved IPs and re-validates every redirect hop. `llm.service.ts` is a thin layer over it with four functions: word-card JSON, plain text, streaming plain text, and vision. Vision sends base64 data URLs because Ollama's chat/completions accepts base64 but not image URLs.

### OCR Pipeline

Three strategies: Tesseract (local CLI), PaddleOCR (Python microservice at port 8001 via `uv`), and a vision model on one of the user's own endpoints.

### Auth Flow

Session-based with HttpOnly cookies — `user_sessions` table stores token hashes. Auth middleware validates session tokens from cookies on every request. Access middleware checks `access_status` and `access_expires_at` so expired accounts stop working.

## Conventions

- **Backend files**: kebab-case + role suffix (`word.routes.ts`, `error.middleware.ts`)
- **Frontend components**: PascalCase (`HomeView.vue`, `WordInput.vue`)
- **Functions/store hooks**: camelCase (`useWordStore`)
- TypeScript `strict` in both apps; avoid `any`. Frontend uses semicolons, backend mostly omits them — match the file you're editing.
- Comments explain "why", not "what"; no comments on obvious code; functions must have comments.
- `.gitignore` covers `dist/`, `node_modules/`, `.env.dev.local`, logs, coverage.

## Environment

Config lives in `backend/.env` (template) and `backend/.env.dev.local` (actual dev values, gitignored). Key variables: `PORT`, `DATABASE_URL`, `USER_API_KEY_SECRET`, `MIGRATE_ON_STARTUP`, `OLLAMA_OPENAI_BASE_URL`, `PREWARM_BASE_URL`/`PREWARM_API_KEY`/`PREWARM_MODEL`, `OCR_TIMEOUT`, `MODEL_GLOBAL_CONCURRENCY`, `MODEL_USER_CONCURRENCY`, `MODEL_RATE_LIMIT_MAX`, `MODEL_QUEUE_TIMEOUT_MS`.
