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
- User-provided model endpoints (any OpenAI-compatible base URL, API key, and model name), stored encrypted in PostgreSQL.
- Multiple endpoints per user with one default; presets for DeepSeek, Kimi, and a local Ollama.
- Backend-hosted frontend build for one-port deployment or ngrok sharing.

## Tech Stack

- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router.
- Backend: Express, TypeScript, PostgreSQL, raw SQL through `pg`.
- AI: any OpenAI-compatible `/v1/chat/completions` endpoint. Presets ship for DeepSeek, Kimi, and a local Ollama.
- OCR: Tesseract, a local OCR microservice through `uv`, or a vision model on one of your endpoints.

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
- An OpenAI-compatible model endpoint (DeepSeek, Kimi, a local Ollama, or anything else). There is no server-side fallback key, so each user must configure one before generation or OCR works.

Depending on which OCR method you use, one of these as well:

- `tesseract-ocr` — the `tesseract` method shells out to the `tesseract` binary, and it is also what the API falls back to when a request omits `method`. Install with `apt install tesseract-ocr` (Debian/Ubuntu) or `brew install tesseract` (macOS). The backend runs it as `tesseract <file> stdout -l eng`, so the English language data has to be present (`tesseract-ocr-eng` on Debian/Ubuntu, included on macOS); check with `tesseract --list-langs`. The reading page UI does not currently offer this method.
- `uv` if you want to run the Python OCR service (the `paddle` method).

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
USER_API_KEY_SECRET=any-long-random-string
```

Start the app:

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:9003`
- Backend: `http://localhost:3003`
- Health check: `http://localhost:3003/health`

The backend runs versioned migrations on startup, then seeds the built-in word books.

## Development Workflow

Run the full local gate before committing — it is exactly what CI runs:

```bash
npm run verify     # typecheck + test + build
```

Individual steps:

```bash
npm run typecheck  # vue-tsc (frontend) + tsc (backend)
npm test           # vitest: frontend + backend
npm run build      # production build
```

After starting the backend, confirm it is actually serving:

```bash
npm run health:check         # local http://127.0.0.1:3003
npm run health:check:prod    # https://scenlex.cn
```

`main` is the only development branch. Do not open long-lived branches off it.

## Database Migrations

The schema lives in `backend/migrations/` as versioned migrations and is applied automatically on backend startup. See [docs/database-migrations.md](docs/database-migrations.md) for how to add one.

```bash
npm --prefix backend run migrate:status   # what has been applied
npm --prefix backend run migrate:up       # apply pending migrations
npm --prefix backend run migrate:down     # roll back the last migration
```

## Developing Against the Production Database

Production PostgreSQL only listens on `127.0.0.1` and is not reachable from the internet. Reach it through an SSH tunnel instead of exposing the port:

```bash
npm run dev:db-tunnel   # 127.0.0.1:5433 -> production 127.0.0.1:5432
```

Keep that terminal open, then point `backend/.env.dev.local` at the tunnel:

```env
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5433/scenelex_db
MIGRATE_ON_STARTUP=false
```

`MIGRATE_ON_STARTUP=false` is mandatory here: the backend applies migrations on startup, and with a tunnel that means any migration you have not deployed yet gets applied straight to production.

Because of this, `npm run dev` **on its own will fail** while the tunnel is closed — the backend exits with `connect ECONNREFUSED 127.0.0.1:5433` and `ts-node-dev` keeps respawning it. Vite still starts on 9003, but every `/api` call fails. Start the tunnel first, or switch `DATABASE_URL` in `backend/.env.dev.local` back to the local database when you do not need production data.

> Your local server writes to real data. Logging in creates sessions, generating cards writes `system_word_cards`, and the startup word-book seed upserts reference data. Use a separate database if you need to test destructive changes.

The CLI scripts under `backend/scripts/` load configuration through `backend/scripts/load-env.js`, which reads the same files as the backend (`backend/.env.dev.local`, then `backend/.env`, then a repo-root `.env`; anything already in `process.env` wins). They therefore hit whatever `DATABASE_URL` points at — with the tunnel open, `npm run key:create` and `npm run user:renew` write straight to production.

## Model Endpoints

There is no server-side fallback key. Each user configures their own endpoints in Settings, and every call goes to an OpenAI-compatible `/v1/chat/completions`.

An endpoint is a base URL, an API key, and a model name; the vision model is a separate field on the same endpoint (leave it empty if that endpoint should not do OCR). Users can keep several endpoints and pick one as the default. Settings ships presets for DeepSeek, Kimi, and a local Ollama — a preset just fills the form, it is not a whitelist.

### System endpoint and VIP

An admin can configure one **system endpoint** in `/admin`. It is the shared, admin-funded fallback, so a user who cannot or will not configure their own endpoint can still generate cards and run OCR — they just need to be marked **VIP**.

Resolution order for every model call:

1. the user's own default endpoint, if they have one (their own quota, no shared cost)
2. the system endpoint, if the user is an admin or VIP
3. otherwise the request fails with a message telling them to add an endpoint or ask the admin

OCR follows the same order, looking for a vision model on the user's own endpoints first and falling back to the system endpoint.

Because the system endpoint belongs to the admin, it is allowed to point at private addresses over plain `http` — pointing it at an internal vLLM is normal operations. User-entered endpoints do not get that exemption.

Why `/v1/chat/completions` and not `/v1/responses`: the point of letting users paste a URL is breadth of compatibility, and chat/completions is what essentially every provider and local runtime implements. The Responses API's real advantage is server-side conversation state, and Ollama explicitly only supports the stateless flavour.

Useful environment variables:

```env
USER_API_KEY_SECRET=

# Optional: only used by the prewarm script and the Ollama preset
OLLAMA_OPENAI_BASE_URL=http://localhost:11434/v1
PREWARM_BASE_URL=
PREWARM_API_KEY=
PREWARM_MODEL=

# Optional Cloudflare R2 avatar storage
R2_AVATAR_PUBLIC_BASE_URL=https://avatars.scenlex.cn
R2_AVATAR_UPLOAD_URL=https://avatar-upload.scenlex.cn
R2_AVATAR_UPLOAD_TOKEN=
```

VIP is a single flag (`users.is_vip`) whose only meaning is *may use the system endpoint*. It does not affect login, account expiry, rate limits, or anything else.

> **VIP does not extend the account.** A user whose `access_expires_at` has passed is rejected by the access middleware with `403 账号已过期，请联系管理员续期` before any model call runs. Giving someone access means **renewing their account and marking them VIP** — doing only the second one leaves them looking at an expiry error.

Set `USER_API_KEY_SECRET` before users save endpoints, and then leave it alone — it is the key those endpoints are encrypted with, so changing it makes every stored endpoint undecryptable and every user has to paste their API key again.

The landing page's "contact the admin" link is the one setting that is *not* here: it is baked into the frontend at build time, so it lives in `frontend/.env.local` as `VITE_CONTACT_EMAIL`. Leave it empty and the link is not rendered at all. See [docs/deployment.md](docs/deployment.md).

In production this is enforced rather than merely advised: the backend refuses to start when `NODE_ENV=production` and the variable is unset, because the alternative is silently falling back to a constant that is published in this repository.

### User-supplied URLs are untrusted

Endpoint base URLs come from users, and the backend is what fetches them. Every outbound request therefore goes through an SSRF guard (`backend/src/utils/ssrf-guard.ts`) that resolves DNS first and then validates the resolved IPs, so a hostname pointing at `127.0.0.1` cannot slip through. Loopback, private, link-local (including the cloud metadata address `169.254.169.254`), CGNAT, multicast, and reserved ranges are blocked, IPv4-mapped and NAT64 encodings included, and redirects are re-validated on every hop.

Admin-maintained presets are the only exception: trust is decided by comparing the URL against the preset list, never by a flag the client sends. User-entered endpoints must use `https`. A local Ollama on a LAN address has to be added as a preset.

## OCR

Start the optional OCR service:

```bash
npm run dev:ocr
```

Default OCR service URL:

```env
OCR_SERVICE_URL=http://127.0.0.1:8001/ocr
```

Vision OCR runs on the user's own endpoint: give one of your endpoints a vision model, and pick `vision` as the OCR method in the reading page. Images are sent as base64 data URLs, because Ollama's chat/completions accepts base64 but not image URLs.

There are three methods — `tesseract`, `paddle`, `vision` — but the reading page currently only renders `vision`; the other two are reachable through the API (`POST /api/ocr`) but not from the UI. That is why `tesseract` being the API-level default is easy to miss: leave `method` out of a request and the backend will try to exec a binary that may not be installed. Pass `method` explicitly.

`OCR_TIMEOUT` controls the vision request timeout; Tesseract and PaddleOCR have their own (`TESSERACT_OCR_TIMEOUT`, `PADDLE_OCR_TIMEOUT`).

## Production Build

Build frontend and backend:

```bash
npm run build
```

Run the compiled backend:

```bash
npm run start:prod
```

When `frontend/dist` exists, the backend serves the built frontend and API from the same port. User avatars are uploaded to Cloudflare R2 when all `R2_*` variables are configured; otherwise they fall back to `/uploads/avatars`.

### Running under PM2

`npm run start:prod` runs the server in the foreground with no supervisor. For a real deployment, use the PM2 template:

```bash
cp ecosystem.config.example.cjs ecosystem.config.cjs
# fill in DATABASE_URL and USER_API_KEY_SECRET
pm2 start ecosystem.config.cjs
pm2 save
```

`ecosystem.config.cjs` is gitignored because it holds the database password and model keys; the `*.example.cjs` template holds none and is tracked, so keep real values out of it.

The template is `fork` mode with `instances: 1` on purpose. The rate limiter and the model concurrency queue live in process memory, so a second instance would double every quota instead of sharing it.

In production the backend loads **no** `.env` file — `src/config/env.ts` only reads one outside production. Everything has to arrive through the `env` block (or the systemd/container environment): `DATABASE_URL` and `USER_API_KEY_SECRET` are required, the rest have defaults. After editing the file, reload it with `pm2 restart ecosystem.config.cjs --only scenelex --update-env`; a plain `pm2 restart scenelex` will not pick up the change.

Missing either required variable is a startup failure, not a warning. That is deliberate for both: a backend with no database still answers `/health` with 200, so a deploy would look green while every real request failed, and a missing `USER_API_KEY_SECRET` silently encrypts user keys with a constant published in this repository.

### Reverse proxy and client IP

Whenever the backend sits behind a proxy, set `TRUST_PROXY_HOPS` to the number of proxies in front of it — `2` for the default Cloudflare → Nginx setup, `1` if Nginx is the only one. The default is `2`.

This is not cosmetic. Login and registration are rate limited per IP, and without the setting `req.ip` is always `127.0.0.1` (Nginx), so the limit collapses into a single shared bucket — twenty failed logins in fifteen minutes across *all* users. Counting the wrong number of hops is also a problem in the other direction: too many hops and a forged `X-Forwarded-For` is accepted as the real client.

Counting hops only works if the backend can *only* be reached through those proxies. If the origin is reachable directly, an attacker bypasses Cloudflare and writes whatever `X-Forwarded-For` they like, so restrict the origin's firewall to [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) — that part cannot be enforced from inside the app.

For temporary public sharing through ngrok:

```bash
npm run start:tunnel
```

## Operations

Deploying to a new server — prerequisites, database, configuration, Nginx, HTTPS, backup, upgrade and rollback — is covered step by step in [docs/deployment.md](docs/deployment.md).

[docs/server-operations.md](docs/server-operations.md) is a different thing: a snapshot of one particular production server (paths, backup location, release history). It is not a deployment guide, and it goes stale.

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

### Creating the first admin

The admin API is admin-only, so a fresh database has no way to promote anyone through the app. Use the scripts instead:

```bash
npm run key:create -- --days 30        # mint an access key (works without any admin)
# register an account with that key in the app
npm run user:promote -- --email you@example.com
```

`user:promote` is idempotent, so running it again is safe. `npm run user:demote -- --email <邮箱>` reverses it and refuses to remove the last remaining admin, which would otherwise leave nobody able to sign access keys.

Admin accounts keep login and admin-panel access after `access_expires_at`; use `user:suspend` when an admin must be explicitly disabled.

Import the exam word books:

```bash
npm run wordbook:import                 # CET-6, TEM-4 and TEM-8 in one run
npm run wordbook:import -- --book tem8  # just one book
```

The word lists ship in `backend/data/<code>-word-list.json`, so this needs no network access. A backend start only seeds about ten reference words per book (`src/config/database.ts`); the full lists come from this command. Re-running it is safe — each book is cleared and rewritten inside one transaction.

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

## Handing the Project Over

Clone or export the repository — do not zip the working directory.

Most of what you would leak is gitignored, so `git clone` and `git archive` never carry it: `backend/.env.dev.local` (produces your production `DATABASE_URL`), its `.bak-*` copies, `backend/uploads/` and `ocr-service/uploads/` (real user avatars and OCR images), `ecosystem.config.cjs` (database password and model keys), `mobile/android/key.properties` and the keystore it points at, `mobile/android/local.properties`, `backups/`. A folder zip takes all of it, and nothing in the archive says which parts were yours alone.

Check before you hand anything over:

```bash
npm run handover:check                  # the working tree
npm run handover:check -- ../the-zip    # an unpacked copy
```

It lists local-only files still sitting in the directory (fatal for a zip, harmless for a clone) and files that are git-*tracked* despite being sensitive (fatal for both, and a sign to rotate the credential). It prints file names only, never contents, so its output is safe to paste.

Two things it cannot check for you:

- **Git history.** A file deleted in a later commit is still in the objects of an earlier one, and clone hands over all of them.
- **Anything outside the directory.** The release keystore lives outside the repository by design; hand it over separately, or the recipient cannot ship an update that installs over an existing one.

## Verification

The automated gate is `npm run verify` (typecheck + vitest + build) — see [Development Workflow](#development-workflow). It is the same command CI runs on every push. Backend tests that need a database are skipped unless `RUN_DB_TESTS=1` is set.

Beyond that, a basic manual smoke test:

1. Start the app with `npm run dev`.
2. Open `http://localhost:9003`.
3. Register or log in with an access key.
4. Search a word, generate a scene card, save it, and review it.
5. Open the reading page and test article lookup or OCR if configured.
