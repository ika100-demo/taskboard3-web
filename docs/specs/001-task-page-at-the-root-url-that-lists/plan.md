---
spec_id: 001-task-page-at-the-root-url-that-lists
shape: web-nextjs
spec_hash: 9fa112961682
summary: Task page at / that lists tasks from the Task API and adds tasks through a server-side route
tasks:
  - id: t1
    title: Task types, title validation and server-side Task API client
    files: [app/_lib/task.ts, app/_lib/tasks-api.ts, app/api/ready/route.ts, docs/env-vars.md]
    covers: [AC-001.2, AC-001.3, AC-001.7, AC-001.8, AC-001.9, AC-001.12, AC-001.13, AC-001.15]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t4
    title: Stub Task API and Playwright wiring for e2e tests
    files: [e2e/support/tasks-api-stub.mjs, playwright.config.ts]
    covers: [AC-001.3, AC-001.10, AC-001.16]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: POST /api/tasks route handler
    files: [app/api/tasks/route.ts]
    covers: [AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.13, AC-001.14, AC-001.15, AC-001.16]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t3
    title: Task page and TaskBoard client component replace the starter page
    files: [app/page.tsx, app/_components/task-board.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, app/globals.css, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.13, AC-001.14, AC-001.15, AC-001.16, AC-001.17]
    parallel_safe: true
    depends_on: [t1]
---

# Plan — 001 Task page at the root URL

Levels: t1, t4 → t2, t3. The contract every task builds against is in [design.md](design.md); the cross-cutting rule is [ADR-001](../../adr/001-server-side-backend-access.md). No gitops tasks: `TASKS_API_URL` is already wired by the system plan.

## t1 — Task types, title validation and server-side Task API client

**Files:** app/_lib/task.ts, app/_lib/tasks-api.ts, app/api/ready/route.ts, docs/env-vars.md
**Covers:** AC-001.2, AC-001.3, AC-001.7, AC-001.8, AC-001.9, AC-001.12, AC-001.13, AC-001.15
**Goal:** the shared `Task` type and helpers, and the only module that talks to the Task API, exactly as in design.md "Shared types and helpers" and "Server client".

**Implementation notes:**
- `task.ts`: `Task`, `isTask`, `TitleError`, `validateTitle` (trim, then `[...s].length` code points, limit 200 inclusive), `MESSAGES`. No Node or server imports: it is bundled into the client.
- `tasks-api.ts`: read `process.env.TASKS_API_URL` inside each call (not at module load), strip a trailing slash; unset means failure (logged).
- Both calls: `cache: "no-store"`, `signal: AbortSignal.timeout(5000)`, exactly one request, catch everything, never throw.
- `listTasks`: `200` + array + every item `isTask` → `{ok: true, tasks}` reduced to `{id, title, due_date}`, order kept; otherwise `{ok: false}`.
- `createTask`: send `{"title": <as given>, "due_date": <string|null>}` with `Content-Type: application/json`; `201` + `isTask` → ok; `422` whose `detail` is an array with an entry whose `loc` array contains `"title"` → `title_invalid`; else `failed`.
- Log failures as one JSON line through `console.error` (`level`, `msg: "tasks_api_call_failed"`, `op`, `status`, `error`).
- `app/api/ready/route.ts`: behaviour unchanged; replace the comment with "readiness must not check the Task API (ADR-001, AC-001.8)".
- `docs/env-vars.md`: new "Upstream APIs" section: `TASKS_API_URL`, no default, server side only, base URL of the Task API without trailing slash, set by the gitops entry to `http://taskboard3-api`; unset shows the load error and every save fails.

**Done when:** the acceptance unit tests for the Task API client and `validateTitle` pass (fetch stubbed under `TASKS_API_URL`), and `/api/ready` and `/api/health` tests still pass with no API.

## t4 — Stub Task API and Playwright wiring for e2e tests

**Files:** e2e/support/tasks-api-stub.mjs, playwright.config.ts
**Covers:** AC-001.3, AC-001.10, AC-001.16
**Goal:** e2e tests run against a controllable stub of the Task API, never a real one, as specified in design.md "E2E stub Task API".

**Implementation notes:**
- Plain Node `http` server in an `.mjs` file, no new dependency; port from `E2E_TASKS_API_PORT`; in-memory list, overrides and request log exactly as the design's table; `crypto.randomUUID()` for ids.
- `playwright.config.ts`: when `SMOKE_BASE_URL` is unset, pick a free port for the stub the same way as `E2E_PORT` (store it in `process.env.E2E_TASKS_API_PORT` so workers inherit it), set `process.env.E2E_TASKS_API_URL=http://127.0.0.1:<port>`, make `webServer` an array: the stub first (`url: .../health`), then the app with `TASKS_API_URL` set to the stub URL in its `env`; set `workers: 1`.
- With `SMOKE_BASE_URL` set, the config behaves exactly as today (no stub, no local app).

**Done when:** `devbox run e2e` starts both servers, `curl`-equivalent calls to the stub's control surface behave as designed (the e2e acceptance specs exercise them), and `devbox run smoke` is unchanged.

## t2 — POST /api/tasks route handler

**Files:** app/api/tasks/route.ts
**Covers:** AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.13, AC-001.14, AC-001.15, AC-001.16
**Goal:** the browser-facing save endpoint with the status codes and bodies of design.md "Browser-facing save endpoint".

**Implementation notes:**
- `export const dynamic = "force-dynamic"`; `export async function POST(request: Request)`.
- Parse JSON defensively; wrong shape → `400 {"error":"bad_request"}` without an upstream call. `""` or missing `due_date` → `null`.
- `validateTitle(title)` fails → `422 {"error": <code>}`, no upstream call.
- Call `createTask({title: <untrimmed>, due_date})` once. ok → `201` task; `title_invalid` → `422` with `validateTitle`'s code, else `title_too_long`; `failed` → `502 {"error":"save_failed"}`.
- Never echo upstream bodies or statuses; use `NextResponse.json` like the existing routes.

**Done when:** the acceptance tests for `POST /api/tasks` pass (route called with `new Request`, fetch stubbed under `TASKS_API_URL`), including "exactly one upstream POST" and "no upstream call on an invalid title".

## t3 — Task page and TaskBoard client component replace the starter page

**Files:** app/page.tsx, app/_components/task-board.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, app/globals.css, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.13, AC-001.14, AC-001.15, AC-001.16, AC-001.17
**Goal:** the root page shows the task page with the markup of design.md "Page markup", and adding a task works without a reload.

**Implementation notes:**
- `app/page.tsx`: `export const dynamic = "force-dynamic"`; async default export renders `<h1>Tasks</h1>` and `<TaskBoard initialTasks={result.ok ? result.tasks : null} />` from `listTasks()`. Remove all starter content.
- `task-board.tsx` (`"use client"`): imports only from `app/_lib/task.ts`, never `tasks-api.ts`. State: tasks, title, dueDate, titleError, saveFailed, pending.
- Render exactly one of list / "No tasks yet." / load error per the design; `<time>` only when `due_date !== null`; show the date string as is.
- Form `noValidate`; no `required` or `maxLength`; title error paragraph `id="task-title-error"` right after the input with `aria-invalid`/`aria-describedby`; save failure `role="alert"`.
- Submit flow exactly as the design's "Client flow on submit" (pending guard plus disabled button; client validation before any request; append the response's task; clear fields only on success).
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (only the starter page used them).
- `app/globals.css`: drop the hero, card, grid and steps rules; add small rules for the form, field error, alert and task list using the existing tokens; the layout must not scroll horizontally at 375 px.
- `tests/page.test.tsx`: delete the starter assertions (delete the file if nothing else is left in it).
- `e2e/home.spec.ts`: replace the "taskboard3-web" heading check with the `h1` "Tasks" and the landmarks; replace the "Check health" link test with a direct `GET /api/health` check; keep the 404 and phone-width tests.

**Done when:** the page, list and form acceptance tests (Vitest and e2e) pass, `devbox run quality` is clean and coverage stays above the 80 % gate.
