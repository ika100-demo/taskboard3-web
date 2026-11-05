# Verification — 001 Task page at the root URL that lists tasks and adds a task through the Task API

**Result:** pass
**Commit:** 7ed53b4 · **Base:** 324ec3c · **Trace:** 17/17 criteria named by tests (smoke: AC-001.1, AC-001.10 in `e2e/tasks-smoke.spec.ts`)

Every acceptance criterion is met. Review cycle 1 failed on one deviation that was not acceptable (removed CSS rules still used by the template's 404 and error pages). The fix commit 7ed53b4 resolves it (see "Deviations from the plan", item 1).

| Criterion | Verdict | Tests | Implementation | Notes |
|---|---|---|---|---|
| AC-001.1 | met | `e2e/tasks.spec.ts` "AC-001.1 the root URL shows the task page…"; `e2e/tasks-smoke.spec.ts` "AC-001.1 … @smoke"; `tests/tasks-page.test.tsx` "AC-001.1 shows the task form and heading…" | `app/page.tsx:6-13`, `app/_components/task-board.tsx:57-101` | The tests check status 200, banner and contentinfo, a single h1 "Tasks", both labels, the button, no "taskboard3-web" heading, no "Check health" link, and exactly one list state (smoke counts the three states). The feature cards are gone: `feature-card.tsx` was deleted, and the Vitest check for the region "What's included" is absent. |
| AC-001.2 | met | `tests/tasks-page.test.tsx` "AC-001.2 shows the tasks in the order…", "AC-001.2 drops fields…"; `e2e/tasks.spec.ts` "AC-001.2 …" | `app/_lib/tasks-api.ts:38-42` | The seed is deliberately not alphabetical (Zebra, Apple, Mow), so a re-sort would fail the test. Titles and dates are asserted per item. |
| AC-001.3 | met | `tests/tasks-page.test.tsx` "AC-001.3 asks the Task API on every render…"; `e2e/tasks.spec.ts` "AC-001.3 a task created through the API shows at the end after a reload" | `app/page.tsx:4`, `app/_lib/tasks-api.ts:31` | `force-dynamic` and `cache: "no-store"` are asserted. The e2e test creates the task on the stub directly and checks that it is the second item after a reload. |
| AC-001.4 | met | `tests/tasks-page.test.tsx` "AC-001.4 shows no date and no placeholder…"; `tests/tasks-board.test.tsx` "AC-001.4 …"; `e2e/tasks.spec.ts` "AC-001.4 …" | `app/_components/task-board.tsx:97` | The item text is exactly the title, there is no `<time>`, and the text matches none of null, undefined, Invalid or any dash. |
| AC-001.5 | met | `tests/tasks-page.test.tsx` "AC-001.5 shows 2026-12-31 unchanged in time zone %s" (server TZ Etc/GMT+12, Etc/GMT-14, UTC); `e2e/tasks.spec.ts` "AC-001.5 …" with Playwright `timezoneId` for the same three zones (browser, also after a client-side add) | `app/_components/task-board.tsx:97` | The string is rendered as is. There is no `Date` or `toLocale*` anywhere in `app/`. |
| AC-001.6 | met | `tests/tasks-page.test.tsx` "AC-001.6 …"; `tests/tasks-board.test.tsx` "AC-001.6 …"; `e2e/tasks.spec.ts` "AC-001.6 …" | `app/_components/task-board.tsx:90-91` | Both assert that no `list` role is present. |
| AC-001.7 | met | `tests/tasks-page.test.tsx` "AC-001.7 shows the load error and still the form when the API answers %s" (503, 500, 404, 200 object, 200 non-JSON, invalid item, refused), "… within 5 seconds" (hanging fetch aborted by the real 5 s signal), "… TASKS_API_URL is not set"; `e2e/tasks.spec.ts` "AC-001.7 …" (503, 500, 404, non-array, closed connection, 8 s delay; page status 200) | `app/_lib/tasks-api.ts:23-47`, `app/_components/task-board.tsx:88-89` | The tests assert that no body text, status code, error name or "stack" is shown. |
| AC-001.8 | met | `tests/tasks-route.test.ts` "AC-001.8 /api/health and /api/ready answer 200 while the Task API is unavailable"; `e2e/tasks.spec.ts` "AC-001.8 …" | `app/api/ready/route.ts` (behaviour unchanged, comment only), `app/api/health/route.ts` (untouched) | Both tests also check that the probes never call the Task API. |
| AC-001.9 | met | `e2e/tasks.spec.ts` "AC-001.9 submitting sends exactly one POST /tasks…", "… sends due_date null"; `tests/tasks-route.test.ts` "AC-001.9 sends exactly one POST /tasks…", "… due_date null when no date is picked (%s)"; `tests/tasks-board.test.tsx` "AC-001.9 …" | `app/_components/task-board.tsx:32-36`, `app/api/tasks/route.ts:25,31`, `app/_lib/tasks-api.ts:67-73` | The e2e test asserts the stub's whole request log equals one POST with the exact body. |
| AC-001.10 | met | `e2e/tasks.spec.ts` "AC-001.10 an added task appears at the end…", "'No tasks yet.' disappears…", "an earlier error text is gone…"; `e2e/tasks-smoke.spec.ts` "AC-001.10 … @smoke @writes"; `tests/tasks-board.test.tsx` "AC-001.10 …" ×2 | `app/_components/task-board.tsx:23-24,38-42` | The tests check that the task is appended at the end, the fields are emptied, the alert is gone and the task survives a reload. The smoke test uses a unique `smoke-<uuid>` title and is tagged `@writes`. |
| AC-001.11 | met | `e2e/tasks.spec.ts` "AC-001.11 …"; `tests/tasks-board.test.tsx` "AC-001.11 …" ×2; `tests/tasks-route.test.ts` "AC-001.11 …" | `app/_components/task-board.tsx:35,39`, `app/api/tasks/route.ts:31` | The title is sent untrimmed, and the list shows the API's trimmed title. |
| AC-001.12 | met | `tests/tasks-board.test.tsx` "AC-001.12 shows 'Please enter a title.' next to the field…" (`nextElementSibling`, `aria-describedby`, zero calls, still "No tasks yet."), "… no native validation", "… clears the title error"; `tests/tasks-route.test.ts` "AC-001.12 …"; `e2e/tasks.spec.ts` "AC-001.12 …" ×2 | `app/_lib/task.ts:13-18`, `app/_components/task-board.tsx:25-29,57,60-73`, `app/api/tasks/route.ts:28-29` | |
| AC-001.13 | met | `tests/tasks-lib.test.ts` "AC-001.13 …"; `tests/tasks-board.test.tsx` "AC-001.13 refuses 201…", "sends %s" (200 ASCII, 200 emoji, padded), "refuses 201 emoji"; `tests/tasks-route.test.ts` "AC-001.13 …" ×3; `e2e/tasks.spec.ts` "AC-001.13 …" ×2 | `app/_lib/task.ts:14-16` (`[...raw.trim()].length`) | Exactly 200 code points, including 200 emoji, is sent and accepted end to end (the stub counts code points too). |
| AC-001.14 | met | `tests/tasks-route.test.ts` "AC-001.14 falls back to title_too_long…", "… code that fits the trimmed input"; `tests/tasks-board.test.tsx` "AC-001.14 shows the message for %s next to the title field and adds nothing"; `e2e/tasks.spec.ts` "AC-001.14 …" | `app/_lib/tasks-api.ts:49-57,79-81`, `app/api/tasks/route.ts:33-35`, `app/_components/task-board.tsx:43-44` | An upstream 422 for an empty trimmed title cannot happen, because the route answers `title_required` before calling the API. |
| AC-001.15 | met | `tests/tasks-route.test.ts` "AC-001.15 answers 502 save_failed, leaks nothing and calls the API once for %s" (503, 500, 404, 422 without title, non-task 201, non-JSON 201, refused), "… within 5 seconds, without retry", "… logs … one JSON line"; `tests/tasks-board.test.tsx` "AC-001.15 …"; `e2e/tasks.spec.ts` "AC-001.15 …" ×5 plus the 8 s delay case | `app/_lib/tasks-api.ts:59-89`, `app/api/tasks/route.ts:36`, `app/_components/task-board.tsx:45-49` | The tests assert the kept title and date, nothing appended, exactly one POST at the stub, and no status codes or bodies shown. |
| AC-001.16 | met | `e2e/tasks.spec.ts` "AC-001.16 the browser never calls the Task API…" (every browser request origin equals the app origin, across load, add and reload); `tests/tasks-board.test.tsx` "AC-001.16 …" | `app/_components/task-board.tsx:6,32`, `app/_lib/tasks-api.ts` (imported only by `app/page.tsx` and `app/api/tasks/route.ts`) | |
| AC-001.17 | met | `tests/tasks-board.test.tsx` "AC-001.17 disables the button while saving…" (click and form submit while pending, one call); `e2e/tasks.spec.ts` "AC-001.17 …" (1.5 s delayed POST, forced click and Enter, one POST) | `app/_components/task-board.tsx:22,30,51,79` | |

## Non-goals

- There is no editing, completing, deleting, reordering, pagination, search, filtering or sorting. The list keeps the API's order. ✔
- Dates are shown only as `YYYY-MM-DD`, with no locale formatting. ✔
- There are no live updates: the list is fetched only during the server render. ✔
- There are no retries. `createTask` and `listTasks` each make one `fetch` (`app/_lib/tasks-api.ts:31,67`), and the client makes one `fetch` per submit. ✔
- There is no sign-in. The Task API, its database and its probes are not changed. ✔
- Template-owned layout: `app/layout.tsx`, `site-header.tsx` and `site-footer.tsx` are unchanged. ✔ The header nav (Health, Ready, Metrics) is intact. The tests scope their assertions to `main` or to specific roles, not to the whole page. Template styling is intact after 7ed53b4 (deviation 1).

## Deviations from the plan

1. **Resolved in 7ed53b4 (cycle 2):** in task t3, `app/globals.css` had removed `.section-title` and `.lead`, which the template-owned `app/not-found.tsx:9,12` and `app/error.tsx:16,19` still use. Commit 7ed53b4 restores both rules with the same declarations as `324ec3c:app/globals.css:252-256,311-314`. Every `className` used in `app/` now has a rule in `app/globals.css` (checked one by one). `.section`, `.section-head` and `.section-sub` stay removed because nothing uses them. Acceptable now.
2. `.secrets.baseline.json` changed but is in no task's `files`: the fixture string `"do-not-show-me"` in `tests/tasks-page.test.tsx:59` is marked `is_secret: false`, and the baseline file is excluded from its own scan. Acceptable: it is a test fixture, not a secret.
3. `docs/adr/001-server-side-backend-access.md` is in no task's `files`. It was added with the plan (eff4fdb) and is referenced by the design. Acceptable.
4. `tests/tasks-*.ts[x]`, `e2e/tasks.spec.ts` and `e2e/tasks-smoke.spec.ts` are in no task's `files`. They are the acceptance tests from the red commit 6e28fe3, placed as the design's "Test file layout" says. Acceptable.
5. All four tasks (t1, t2, t3, t4) are `done: true`. ✔

## Contract

The build matches `design.md` with one extension:

- `POST /api/tasks` answers `400 bad_request` when `due_date` is a non-empty string that is not `YYYY-MM-DD` (`app/api/tasks/route.ts:26`). The design lists 400 only for "not JSON, title not a string, due_date neither string nor null". **Acceptable.** The browser's date input only produces `YYYY-MM-DD` or `""`. The client treats any non-201, non-title-422 answer as the save error (`task-board.tsx:45-46`), so the user sees the same thing the 422-without-title path would give (`502` → save error), just without a useless upstream call. No test covers this branch. Add the case to the design's 400 row so the contract stays the source of truth.

Everything else matches the design:
- Upstream calls use `no-store` and `AbortSignal.timeout(5000)`, the POST body always carries `due_date`, and a trailing slash in `TASKS_API_URL` is stripped (`tasks-api.ts:16,31,67-73`).
- `ListResult` and `CreateResult` match, and failures are logged as one JSON line (`tasks-api.ts:9-11`).
- The route's 201, 422, 400 and 502 answers never echo upstream data.
- The markup matches: `noValidate`, no `required` or `maxLength`, `aria-invalid` and `aria-describedby`, `role="alert"` and `role="status"`, `<ul aria-label="Tasks">` and `<time dateTime>`.
- The case "load failed, then a save succeeds" keeps the load error and clears the form (`tests/tasks-board.test.tsx` "load failed, then a save succeeds…").
- `docs/env-vars.md` documents `TASKS_API_URL`.
