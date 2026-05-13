# SceneLex

SceneLex is a full-stack English learning app that turns vocabulary and reading material into AI-assisted study cards, review queues, and reading practice.

The app is built for personal or small-group learning. It combines dictionary lookup, AI-generated word cards, system word books, spaced repetition, OCR-assisted reading, and a streaming reading assistant.

## Features

- Word lookup with dictionary-first Chinese meanings.
- AI word-card generation with short meanings, example scenes, usage tips, and structured JSON output.
- Personal word books and official study books for CET-4, CET-6, TEM-4, and TEM-8.
- Spaced-repetition review using persisted scheduling fields such as ease, interval, review count, and next review time.
- Reading workspace with article storage, word lookup in context, sentence translation, OCR import, and AI assistant chats.
- User accounts with invite/access keys, session cookies, access expiry, and admin management.
- User-provided Kimi or DeepSeek API keys, stored encrypted in PostgreSQL.
- Model-provider switching between Ollama, Kimi, and DeepSeek.
- Backend-hosted frontend build for one-port deployment or ngrok sharing.

## Tech Stack

- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router.
- Backend: Express, TypeScript, PostgreSQL, raw SQL through `pg`.
- AI providers: Ollama native API, Kimi OpenAI-compatible API, DeepSeek OpenAI-compatible API.
- OCR: local OCR service through `uv` plus optional vision-model OCR.

## Project Structure

```text
frontend/      Vue 3 application
backend/       Express API, services, repositories, scripts
ocr-service/   Optional Python OCR microservice
scripts/       Local operation scripts
```

Backend code follows:

```text
routes -> controllers -> services -> repositories -> PostgreSQL
```

Frontend code is organized by:

```text
views, components, stores, services, types, utils
```

## Requirements

- Node.js 22 or newer is recommended.
- PostgreSQL with a writable database.
- Ollama, Kimi, or DeepSeek for AI features.
- `uv` if you want to run the Python OCR service.

## Quick Start

Install dependencies:

```bash
npm run install:all
```

Create your local backend environment file:

```bash
cp backend/.env backend/.env.dev.local
```

Edit `backend/.env.dev.local` and set at least:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME
AI_PROVIDER=ollama
```

Start the app:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:9003`
- Backend: `http://localhost:3003`
- Health check: `http://localhost:3003/health`

The backend auto-initializes required tables on startup.

## AI Provider Setup

Use Ollama:

```bash
npm run dev:ollama
```

Use Kimi:

```bash
npm run dev:kimi
```

Use DeepSeek:

```bash
npm run dev:deepseek
```

Useful environment variables:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/api
OLLAMA_MODEL=qwen3.5:4b

KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.6
KIMI_API_KEY=

DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_KEY=

USER_API_KEY_SECRET=
```

For shared deployments, ordinary users should save their own Kimi or DeepSeek API keys in the settings page. Server-level API keys should be treated as admin/system fallback credentials.

Set `USER_API_KEY_SECRET` before using encrypted user API keys in production. Do not change it casually after users have saved keys, because existing encrypted keys will no longer decrypt.

## OCR

Start the optional OCR service:

```bash
npm run dev:ocr
```

Default OCR service URL:

```env
OCR_SERVICE_URL=http://127.0.0.1:8001/ocr
```

Vision OCR can be routed through Ollama or Kimi with:

```env
OCR_VISION_PROVIDER=ollama
OCR_MODEL=gemma4:e4b
```

## Production Build

Build frontend and backend:

```bash
npm run build
```

Run the compiled backend:

```bash
npm run start:prod
```

When `frontend/dist` exists, the backend serves the built frontend and API from the same port. User avatars are served from `/uploads/avatars`.

For temporary public sharing through ngrok:

```bash
npm run start:tunnel
```

## Operations

Create an access key:

```bash
npm run key:create
```

Manage user access:

```bash
npm run user:suspend
npm run user:resume
npm run user:renew
```

Prewarm CET-6 system word cards:

```bash
npm run prewarm:cet6
```

Download and import dictionary data:

```bash
npm run dict:download
npm --prefix backend run dict:build-cache
npm --prefix backend run dict:import-db
```

## Security Notes

- Do not commit real `.env` files, database dumps, backups, uploaded user files, or API keys.
- Keep local runtime values in `backend/.env.dev.local`.
- Use `USER_API_KEY_SECRET` in production.
- Rotate database passwords and model API keys if they were ever committed.
- The built-in rate limiter and model queue are in-memory and intended for a single Node process. Use shared storage such as Redis before scaling to multiple backend instances.

## Verification

There is currently no dedicated test runner configured. Use the build as the minimum check:

```bash
npm run build
```

For a basic manual smoke test:

1. Start the app with `npm run dev`.
2. Open `http://localhost:9003`.
3. Register or log in with an access key.
4. Search a word, generate a scene card, save it, and review it.
5. Open the reading page and test article lookup or OCR if configured.
