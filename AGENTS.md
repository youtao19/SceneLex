# Repository Guidelines

## Project Structure & Module Organization
`frontend/` contains the Vue 3 app. Put views in `frontend/src/views`, reusable UI in `frontend/src/components`, state in `frontend/src/stores`, API clients in `frontend/src/services`, and shared types/utils in `frontend/src/types` and `frontend/src/utils`.

`backend/` contains the Express API. Follow the existing layered layout: `routes -> controllers -> services -> repositories`, with shared config in `backend/src/config`, middleware in `backend/src/middlewares`, and DTO/domain types in `backend/src/types` and `backend/src/models`.

Build outputs go to `frontend/dist` and `backend/dist`. Do not commit generated files, logs, `coverage`, or local env files covered by `.gitignore`.

## Build, Test, and Development Commands
- `npm run install:all`: install root, frontend, and backend dependencies.
- `npm run dev`: start both apps together from the workspace root.
- `npm run dev:frontend`: run the Vite dev server only.
- `npm run dev:backend`: run the Express API with `ts-node-dev`.
- `npm run build`: build frontend and backend for production.
- `npm --prefix frontend run preview`: preview the built frontend locally.

## Coding Style & Naming Conventions
TypeScript is `strict` in both apps; keep types explicit at API boundaries and avoid `any` and `unknown`. Match the style of the file you edit: the frontend currently favors semicolons, while much of the backend omits them. Do not reformat unrelated files.

Use PascalCase for Vue components and views (`HomeView.vue`, `WordInput.vue`). Use camelCase for functions and store hooks (`useWordStore`). Use kebab-case plus role suffixes for backend module files (`word.routes.ts`, `error.middleware.ts`).

## Testing Guidelines
There is no test runner configured yet at the root, frontend, or backend. Until one is added, treat `npm run build` as the minimum verification step and manually exercise the main path: frontend input -> `POST /api/words/generate` -> rendered result.

When adding tests, keep them close to the feature and use `*.test.ts` naming. Prefer API-level tests for backend routes and component/store tests for frontend logic.

## Commit & Pull Request Guidelines
This repository currently has no commit history, so use short imperative commit messages such as `Add word generation API wiring`. Keep each commit focused on one change set.

PRs should include a clear summary, verification steps, related issue links if available, and screenshots or request/response samples for UI or API changes. Call out new environment variables such as `PORT`, `AI_PROVIDER`, or `DATABASE_URL`.

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
