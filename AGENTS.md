# Repository Guidelines

## Project Structure & Module Organization
`frontend/` contains the Vue 3 app. Put views in `frontend/src/views`, reusable UI in `frontend/src/components`, state in `frontend/src/stores`, API clients in `frontend/src/services`, and shared types/utils in `frontend/src/types` and `frontend/src/utils`.

`backend/` contains the Express API. Follow the existing layered layout: `routes -> controllers -> services -> repositories`, with shared config in `backend/src/config`, middleware in `backend/src/middlewares`, and DTO/domain types in `backend/src/types` and `backend/src/models`.

Build outputs go to `frontend/dist` and `backend/dist`. Do not commit generated files, logs, `coverage`, or local env files covered by `.gitignore`.

## Build, Test, and Development Commands
- `npm run install:all`: install dependencies (root workspaces cover frontend and backend).
- `npm run dev`: start both apps together from the workspace root.
- `npm run dev:frontend`: run the Vite dev server only.
- `npm run dev:backend`: run the Express API with `ts-node-dev`.
- `npm run typecheck`: `vue-tsc` for the frontend, `tsc` for the backend.
- `npm test`: run the vitest suites in both apps.
- `npm run build`: build frontend and backend for production.
- `npm run verify`: typecheck + test + build — the same gate CI runs.
- `npm run health:check` / `npm run health:check:prod`: assert `/health` and the served HTML.
- `npm --prefix frontend run preview`: preview the built frontend locally.

## Database Migrations
Schema changes go in `backend/migrations/` as timestamped `.cjs` migrations. The backend applies them on startup; `database.ts` only runs migrations and seeds reference data. Never add DDL to `database.ts`, and never put anything else in `migrations/` — the runner tries to load every file it finds there. See `docs/database-migrations.md` before writing one.

Startup migrations are controlled by `MIGRATE_ON_STARTUP`, which defaults to on and is only disabled by an explicit `false`. Never set it on the server. It exists so local development can connect to the production database through an SSH tunnel (`npm run dev:db-tunnel`) without pushing undeployed migrations to production.

## Coding Style & Naming Conventions
TypeScript is `strict` in both apps; keep types explicit at API boundaries and avoid `any` and `unknown`. Match the style of the file you edit: the frontend currently favors semicolons, while much of the backend omits them. Do not reformat unrelated files.

Use PascalCase for Vue components and views (`HomeView.vue`, `WordInput.vue`). Use camelCase for functions and store hooks (`useWordStore`). Use kebab-case plus role suffixes for backend module files (`word.routes.ts`, `error.middleware.ts`).

## Testing Guidelines
Vitest runs in both apps; `npm test` from the root runs both suites. Keep tests next to the code as `*.test.ts`.

- Backend: pure logic and service rules (`src/**/*.test.ts`) plus API-contract tests with `supertest` against the Express app. Do not let a unit test require a live PostgreSQL connection — cover request/response contracts and validation instead.
- Frontend: test real logic (service clients, stores, utils), not markup. Stub globals such as `fetch` with `vi.stubGlobal` rather than adding a DOM environment.
- Write migrations with `npm run verify` in mind: the suite must stay runnable without a database.
- When a rule is subtle or easy to regress (review scheduling, password/token handling), add a test that states the rule rather than the implementation.

## Commit & Pull Request Guidelines
This repository currently has no commit history, so use short imperative commit messages such as `Add word generation API wiring`. Keep each commit focused on one change set.

`main` is the single development branch — do not leave long-lived feature branches around. CI (`.github/workflows/ci.yml`) runs `typecheck`, `test`, and `build` on every push and pull request to `main`.

PRs should include a clear summary, verification steps, related issue links if available, and screenshots or request/response samples for UI or API changes. Call out new environment variables such as `PORT`, `AI_PROVIDER`, or `DATABASE_URL`, and call out any migration that touches or deletes existing data.

## Development Specifications
+ The code should be simple and easy to understand.
始终遵守skills: Karpathy Guidelines

## 注释要求
+ 注释要解释“为什么”，不是只解释“做什么”，短，但准确
+ 不能和代码撒谎
+ 补充代码里看不出来的信息
+ 代码一眼能看懂的，不要注释。
+ 代码不清晰的地方，必须注释。
+ 函数要写注释
