# Design — 001 Task page at the root URL that lists tasks and adds a task through the Task API

## Decisions

- **The browser talks only to this web server; the web server talks to the Task API.** The list is fetched by the root page (an async Server Component) during server rendering. A new task is posted by the browser to this app's own route handler `POST /api/tasks`, which calls `POST ${TASKS_API_URL}/tasks`. A route handler, not a Server Action, because its contract is explicit and testable in Vitest by calling the exported `POST` with a `Request` (AC-001.9, AC-001.14, AC-001.15, AC-001.16). ADR: [docs/adr/001-server-side-backend-access.md](../../adr/001-server-side-backend-access.md).
- **No caching anywhere.** `app/page.tsx` exports `dynamic = "force-dynamic"` and the upstream fetch uses `cache: "no-store"`, so every load and reload asks the Task API (AC-001.3).
- **Dates are never parsed.** `due_date` is rendered as the exact `YYYY-MM-DD` string the API returns; no `Date`, no `toLocale*` (AC-001.5).
- **One title rule, shared by client and route.** `validateTitle()` trims and counts Unicode code points (`[...trimmed].length`), the same as the API (Python `len`) (AC-001.12, AC-001.13).
- **Readiness does not depend on the Task API.** `/api/health` and `/api/ready` stay unconditional `200` (AC-001.8): taking the web pods out of the Service while the API is down would replace the friendly load error with a gateway error.
- **No retries** on load or save (spec non-goal; a retried POST could create a task twice).
- **Load failed, then a save succeeds:** the load error text stays (the page never had a list to append to) and the form is cleared. Reload shows the list.
- **E2E tests run against a stub Task API**, a small Node HTTP server started by Playwright next to the app (contract below). Smoke runs (`SMOKE_BASE_URL` set) do not start it.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/task.ts` | `Task` type, `isTask()`, `validateTitle()`, user-facing message constants. No server-only code: imported by client and server. | new |
| `app/_lib/tasks-api.ts` | Server-only client for the Task API: `listTasks()`, `createTask()`; reads `TASKS_API_URL` at call time, 5 s timeout, structured error logging. Never imported by a `"use client"` module. | new |
| `app/api/tasks/route.ts` | `POST /api/tasks`: the browser-facing save endpoint (contract below). | new |
| `app/page.tsx` | Async Server Component: heading "Tasks", calls `listTasks()`, renders `<TaskBoard>`. | changed (starter content removed) |
| `app/_components/task-board.tsx` | `"use client"`: the form, the list / empty text / load error, client validation, posting to `/api/tasks`, pending state. | new |
| `app/_components/feature-card.tsx`, `app/_components/icons.tsx` | starter only | deleted |
| `app/globals.css` | task list and form styles; starter hero/card/steps styles removed | changed |
| `app/api/ready/route.ts` | comment only: readiness must not check the Task API | changed |
| `e2e/support/tasks-api-stub.mjs` | stub Task API for Playwright | new |
| `playwright.config.ts` | starts the stub, points the app's `TASKS_API_URL` at it, one worker | changed |
| `docs/env-vars.md` | documents `TASKS_API_URL` | changed |

## Contract

### Upstream (binding, from the system spec)

`GET ${TASKS_API_URL}/tasks` and `POST ${TASKS_API_URL}/tasks` exactly as the spec's Contract section. `TASKS_API_URL` has no trailing slash; the client strips one anyway. Both calls use `signal: AbortSignal.timeout(5000)`, `cache: "no-store"`, `Content-Type: application/json` on POST. The POST body is `{"title": <as typed, untrimmed>, "due_date": <"YYYY-MM-DD" | null>}`; `due_date` is always present (`null` when no date is picked).

### Shared types and helpers (`app/_lib/task.ts`)

```ts
export type Task = { id: string; title: string; due_date: string | null };
export function isTask(v: unknown): v is Task;      // id non-empty string, title string, due_date null or /^\d{4}-\d{2}-\d{2}$/
export type TitleError = "title_required" | "title_too_long";
export function validateTitle(raw: string): TitleError | null; // trims; empty -> title_required; > 200 code points -> title_too_long
export const MESSAGES = {
  empty: "No tasks yet.",
  loadFailed: "Tasks could not be loaded. Please try again later.",
  saveFailed: "The task could not be saved. Please try again.",
  title_required: "Please enter a title.",
  title_too_long: "The title can be at most 200 characters.",
} as const;
```

### Server client (`app/_lib/tasks-api.ts`)

```ts
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export function listTasks(): Promise<ListResult>;   // never throws
export type CreateResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "title_invalid" }           // upstream 422 with "title" in some detail[].loc
  | { ok: false; reason: "failed" };                 // anything else
export function createTask(input: { title: string; due_date: string | null }): Promise<CreateResult>; // never throws, one request, no retry
```

- `listTasks` succeeds only on `200` with a JSON array whose every item passes `isTask`; items are reduced to `{id, title, due_date}` (extra fields dropped) and kept in the API's order (AC-001.2). Anything else (other status, non-array, invalid item, network error, timeout, `TASKS_API_URL` unset) is `{ ok: false }` (AC-001.7).
- `createTask` succeeds only on `201` with a body passing `isTask`. 
- Failures are logged on the server as one JSON line via `console.error`: `{"level":"error","msg":"tasks_api_call_failed","op":"list"|"create","status":<number|null>,"error":<string>}`. Nothing of it reaches the browser.

### Browser-facing save endpoint: `POST /api/tasks`

Request: `Content-Type: application/json`, body `{"title": string, "due_date": "YYYY-MM-DD" | null}` (`due_date` may be omitted or `""`: both mean `null`).

| Status | Body | When |
|---|---|---|
| `201` | Task object `{"id","title","due_date"}` (the API's, reduced to these fields) | upstream `201` with a valid Task |
| `422` | `{"error": "title_required"}` or `{"error": "title_too_long"}` | `validateTitle(title)` fails (then **no** upstream call), or upstream `422` with `"title"` in a `loc` (the code is chosen by `validateTitle` on the trimmed input; if that passes locally, `title_too_long`) |
| `400` | `{"error": "bad_request"}` | body is not JSON, or `title` is not a string, or `due_date` is neither string nor null (no upstream call) |
| `502` | `{"error": "save_failed"}` | every other upstream outcome: other `422`, `5xx`, `404`, non-Task `201` body, refused connection, timeout |

The route never returns upstream bodies, status codes or stack traces. It exports `dynamic = "force-dynamic"`.

### Page markup (what the tests can select)

Inside the layout's `<main>` (site header and footer unchanged):

- `<h1>` "Tasks" (the only `h1`).
- `<form noValidate aria-label="Add task">`: no `required`, no `maxLength` on the title input (the app's own messages must show, AC-001.12, AC-001.13).
  - `<label for="task-title">Title</label>` + `<input id="task-title" name="title" type="text">`; when a title error is shown: `aria-invalid="true"` and `aria-describedby="task-title-error"` pointing at `<p id="task-title-error">` holding the message, rendered directly after the input.
  - `<label for="task-due-date">Due date (optional)</label>` + `<input id="task-due-date" name="due_date" type="date">`.
  - `<button type="submit">Add task</button>`, `disabled` while a save is in progress (AC-001.17).
  - Save failure: `<p role="alert">The task could not be saved. Please try again.</p>` inside the form.
- Exactly one of:
  - `<ul aria-label="Tasks">` with one `<li>` per task in API order; each holds the title text and, only when `due_date` is not null, `<time dateTime="YYYY-MM-DD">YYYY-MM-DD</time>`. Nothing at all for a null date (AC-001.4).
  - `<p>No tasks yet.</p>` (no `<ul>`) (AC-001.6).
  - `<p role="status">Tasks could not be loaded. Please try again later.</p>` (no `<ul>`) (AC-001.7).

Client flow on submit: if pending, ignore. Clear old errors. `validateTitle` fails → show the title message, no request. Otherwise set pending, `fetch("/api/tasks", POST, {title: <as typed>, due_date: <value or null>})`. `201` with a valid Task → append to the list (switching from "No tasks yet." to the list), clear both fields. `422` with a known `error` code → show that title message. Anything else, or a thrown fetch → save failure text, inputs untouched. Always clear pending.

### Component signatures

```ts
// app/_components/task-board.tsx ("use client")
export function TaskBoard(props: { initialTasks: Task[] | null }): JSX.Element; // null = load failed
// app/page.tsx
export const dynamic = "force-dynamic";
export default async function HomePage(): Promise<JSX.Element>;
```

Vitest renders the page with `render(await HomePage())` after setting `process.env.TASKS_API_URL` and stubbing `fetch` (`vi.stubGlobal`) for URLs under it; the route is tested by calling `POST(new Request(...))`. The page reads `TASKS_API_URL` at call time, so tests can set it per test.

### E2E stub Task API (`e2e/support/tasks-api-stub.mjs`)

Started by `playwright.config.ts` as a second `webServer` on `127.0.0.1:<E2E_TASKS_API_PORT>` (a free port picked like `E2E_PORT`). The app is started with `TASKS_API_URL=http://127.0.0.1:<port>`; the tests read the same base URL from `process.env.E2E_TASKS_API_URL`. `workers: 1` while the stub runs (it has shared state). Neither is started when `SMOKE_BASE_URL` is set.

Task API surface (behaves like the real API's contract):

- `GET /tasks` → `200` with the stored list, creation order.
- `POST /tasks` → validates like the API (title string, trimmed, 1..200 code points; `due_date` `YYYY-MM-DD` or null/omitted); `201` with `{"id": <uuid>, "title": <trimmed>, "due_date": ...}` and stores it; `422` FastAPI-format otherwise (`{"detail":[{"type":"string_too_short","loc":["body","title"],"msg":"...","input":...}]}`).
- `GET /health` → `200 {"status":"ok"}` (Playwright's readiness URL for the stub).

Control surface (tests only):

| Request | Effect |
|---|---|
| `POST /__stub/reset` | empty list, no overrides, request log cleared. Tests call it in `beforeEach`. |
| `PUT /__stub/tasks` body `Task[]` | replace the stored list |
| `PUT /__stub/override` body `{"method":"GET"\|"POST","status"?:number,"body"?:any,"rawBody"?:string,"delayMs"?:number,"destroy"?:boolean}` | from now on (until reset) `<method> /tasks` answers with `status` and `body` (JSON) or `rawBody` (sent as is, `Content-Type: application/json`), after waiting `delayMs`; `destroy: true` closes the socket without answering (refused/reset connection). A POST under an override stores nothing. |
| `GET /__stub/requests` | `200` JSON array of `{"method","path","body"}` for every `/tasks` request received since reset (`body` parsed JSON or null) |

### Test file layout

Acceptance tests go in new files (`tests/tasks-*.test.ts[x]`, `e2e/tasks*.spec.ts`). The starter assertions in `tests/page.test.tsx` and `e2e/home.spec.ts` are removed or rewritten by plan task t3.

## Risks

- A slow Task API holds the page render up to 5 s; accepted by the spec's timeout table.
- `e2e` "no answer within 5 seconds" cases take ~6 s each; keep them few.
