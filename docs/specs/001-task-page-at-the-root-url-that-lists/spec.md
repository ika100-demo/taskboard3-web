---
spec_id: 001-task-page-at-the-root-url-that-lists
title: Task page at the root URL that lists tasks and adds a task through the Task API
status: building
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard3-gitops:001-tasks-in-postgres-seen-and-created-in
---

# 001 — Task page at the root URL that lists tasks and adds a task through the Task API

## Problem

The Task API can create and list tasks, but it keeps them in process memory. Every restart or redeploy (which happens on every merge to main in dev) deletes all tasks, and two running instances would each show a different list. The web app is still the starter page, so a person who is not using API tools has no way to see or add tasks. This spec makes tasks durable in a Postgres database that belongs to the system, and gives people a page in the web app where they can see the task list and add a task. The task contract of the API (fields, validation, order) stays as it is.

## System context

Slice of the system plan `001-tasks-in-postgres-seen-and-created-in` in `ika100-demo/taskboard3-gitops` for `taskboard3-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.6** Given tasks exist, when a person opens the web app's root URL, then the page shows every task's title and due date, in creation order (oldest first), the same set of tasks that `GET /tasks` returns.
- **AC-001.7** Given a task without a due date, when it is shown in the list, then it shows the title and no date (no placeholder such as "null" or "Invalid date").
- **AC-001.8** Given a task with a due date, when it is shown in the list, then the date is shown as the same calendar day that the API returns (for `2026-12-31`: 31 December 2026, never shifted by a time zone), formatted as `YYYY-MM-DD`.
- **AC-001.9** Given no task exists, when a person opens the web app's root URL, then the page shows the text "No tasks yet." instead of an empty list.
- **AC-001.10** Given the API or the database is unavailable, when a person opens the web app's root URL, then the page still loads and shows the text "Tasks could not be loaded. Please try again later." instead of the list, and no error page or stack trace is shown.
- **AC-001.11** Given the task page, when a person enters a title, optionally picks a due date and submits the form, then the new task appears at the end of the list without the person reloading the page, the form is emptied, and the task is also returned by `GET /tasks` and still shown after a reload.
- **AC-001.12** Given the task page, when a person submits the form with an empty or whitespace-only title, then no task is created and the text "Please enter a title." is shown next to the title field.
- **AC-001.13** Given the task page, when a person enters a title of more than 200 characters, then the task is not created and the text "The title can be at most 200 characters." is shown next to the title field; a title of exactly 200 characters is accepted.
- **AC-001.14** Given a title with leading or trailing spaces, when it is submitted in the web app, then the list shows the trimmed title, the same as the API returns.
- **AC-001.15** Given the API or the database is unavailable, when a person submits a valid form, then the text "The task could not be saved. Please try again." is shown, the entered title and due date stay in the form, and no task appears in the list.
- **AC-001.16** Given a task created through the API directly, when a person opens or reloads the web app's root URL, then that task is shown in the list.

### Contract

Between `taskboard3-web` (caller, server side only) and `taskboard3-api`, plus the API's own database layout and probes. Base URL in the cluster: `TASKS_API_URL=http://taskboard3-api` (no trailing slash). All bodies are JSON (`Content-Type: application/json`).

### Task object

```json
{"id": "3f2c9a8e-...", "title": "Buy milk", "due_date": "2026-12-31"}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string, non-empty | Opaque. A UUID string today; the caller must not parse it. |
| `title` | string | Already trimmed, 1 to 200 characters. |
| `due_date` | string `YYYY-MM-DD` or `null` | A calendar date, no time and no time zone. Callers display it as is. |

No other fields. A caller ignores any extra field it does not know.

### `GET /tasks`

- `200` with a JSON array of Task objects, oldest first (creation order). `[]` when there are none. No pagination.
- `503` when the database is unavailable (see Errors).

### `POST /tasks`

Request body: `{"title": <string>, "due_date": <"YYYY-MM-DD" | null>}`. `due_date` may be omitted (same as `null`). The web app sends `null` when no date is picked, and sends the title as typed (the API trims it).

- `201` with the created Task object.
- `422` on invalid input (FastAPI's validation format, see Errors). The rules are unchanged from the API's spec 001: `title` is required, a string, trimmed, 1 to 200 characters; `due_date` is a valid calendar date in `YYYY-MM-DD` or `null`, and past dates are accepted.
- `503` when the database is unavailable. No task was stored.

### Probes of the API

- `GET /health`: `200 {"status": "ok"}` as long as the process runs. It never checks the database.
- `GET /ready`: `200 {"status": "ready"}` when `SELECT 1` succeeds within 1 s. Otherwise `503 {"status": "not ready"}`.

### Storage (API internal, listed so both sides know where the order comes from)

Table `tasks`, created by the API on startup or on the first successful connection (`CREATE TABLE IF NOT EXISTS`):

| Column | Type | |
|---|---|---|
| `seq` | `bigint generated always as identity` | Primary key. The list is `ORDER BY seq`. Never exposed. |
| `id` | `text not null unique` | The UUID returned as `id`. |
| `title` | `varchar(200) not null` | |
| `due_date` | `date null` | Serialized back as `YYYY-MM-DD`. |

Connection settings: `DATABASE_URL` (set by the gitops `uses: postgres` operation). Tasks that the running in-memory API holds are not migrated (a non-goal).

### Errors

- **`422`** (unchanged, FastAPI default): `{"detail": [{"type": "...", "loc": ["body", "title"], "msg": "...", "input": ...}, ...]}`. `loc` names the field (`title` or `due_date`).
- **`503`** (new): `{"detail": "database unavailable"}`. The API sends it for any database connection error, pool timeout or statement timeout on `/tasks`. Other unexpected server errors stay `500`, also with a JSON `{"detail": ...}` body and no stack trace.
- **How the web app treats responses:**
  - `GET /tasks`: only a `200` with a JSON array counts as success. Any other status (`503`, `500`, `404`, ...), a body that is not a JSON array, a refused connection or a timeout shows "Tasks could not be loaded. Please try again later." instead of the list. The page itself still returns `200`.
  - `POST /tasks`:
    - `201`: append the returned task and clear the form.
    - `422` whose `detail` has an entry with `"title"` in `loc`: show the title message that fits the trimmed input ("Please enter a title." when empty, otherwise "The title can be at most 200 characters."). Normally the client check catches these first.
    - Any other `422`, any other status, a body that is not a Task object, a refused connection or a timeout: show "The task could not be saved. Please try again.", keep the title and date in the form and add nothing to the list.
- The web app never shows response bodies, status codes or stack traces to the user. It logs them on the server.

### Timeouts

| Call | Timeout | When the other side is down or slow |
|---|---|---|
| web server → `GET /tasks` | 5 s total (`AbortSignal.timeout(5000)`) | The page renders with the load error text. No retry inside the request; the user reloads. |
| web server → `POST /tasks` | 5 s total | The save error text, and the form keeps its input. **No automatic retry** (a retry after a timeout could create the task twice). |
| API → Postgres, connect / pool checkout | 2 s | `503 {"detail": "database unavailable"}` |
| API → Postgres, statement (`statement_timeout`) | 5 s | `503`. The insert's transaction is rolled back, so no partial task. |
| API `/ready` → `SELECT 1` | 1 s | `503 {"status": "not ready"}`. Kubernetes takes the pod out of the Service; `/health` stays `200`, so the pod is not restarted. |

The API does not cache connection failures. Each request tries the pool again, so service resumes without a restart once the database is back (AC-001.4). The web's 5 s budget covers the API's worst case (2 s connect plus the query), so a database outage reaches the user as a `503`, not as a web timeout.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `TASKS_API_URL=http://taskboard3-api`

### Notes for this repo

Replaces the starter page in app/page.tsx. The API is reached only server side, through
TASKS_API_URL (add it to docs/env-vars.md); the browser never calls the API directly.
Component and e2e tests stub the API at TASKS_API_URL with the responses of the Contract.

## Stories

- As a person on the team, I want to open the web app and see every task with its due date, oldest first, so that I know what is open without using API tools.
- As a person on the team, I want to add a task with a title and an optional due date from the same page, so that I can record work without leaving the browser.
- As a person on the team, I want a clear message when tasks cannot be loaded or saved, and I want to keep what I typed, so that I can try again later instead of seeing an error page.

## Acceptance criteria

- **AC-001.1** Given the web app is running, when a person opens its root URL, then the page answers with status 200 and shows the task page (the site header and footer, the heading "Tasks", a field labelled "Title", a field labelled "Due date (optional)" and an "Add task" button, and none of the starter content: no "taskboard3-web" heading, no feature cards, no "Check health" link) together with exactly one of: the task list, the text "No tasks yet." or the text "Tasks could not be loaded. Please try again later." (system AC-001.6, AC-001.9, AC-001.10) (smoke)
- **AC-001.2** Given the Task API returns three tasks from `GET /tasks`, when a person opens the root URL, then the page shows exactly those three tasks, each with its title and due date, in the order the API returned them (oldest first), and never re-sorted. (system AC-001.6)
- **AC-001.3** Given a person has the task page open and a task is then created through the Task API directly, when the person reloads the root URL, then that task is shown at the end of the list (the page is never served from a cache). (system AC-001.16)
- **AC-001.4** Given a task whose `due_date` is `null`, when it is shown in the list, then its title is shown and no date and no placeholder (such as "null", "undefined", "Invalid date" or a dash) is shown for it. (system AC-001.7)
- **AC-001.5** Given a task whose `due_date` is `2026-12-31`, when it is shown in the list, then the date is shown as the text `2026-12-31`, unchanged in any server or browser time zone (including UTC-12 and UTC+14). (system AC-001.8)
- **AC-001.6** Given `GET /tasks` returns `[]`, when a person opens the root URL, then the page shows the text "No tasks yet." and no empty list. (system AC-001.9)
- **AC-001.7** Given `GET /tasks` answers `503`, `500` or `404`, answers `200` with a body that is not a JSON array, refuses the connection, or does not answer within 5 seconds, when a person opens the root URL, then the page answers with status 200 and shows the text "Tasks could not be loaded. Please try again later." instead of the list, the form is still shown, and no error page, status code, response body or stack trace is shown. (system AC-001.10)
- **AC-001.8** Given the Task API is unavailable, when the web app's own health and readiness endpoints (`/api/health`, `/api/ready`) are called, then both still answer with status 200. (system AC-001.10)
- **AC-001.9** Given the task page, when a person enters the title "Buy milk", picks the due date 2026-12-31 and submits, then the Task API receives exactly one `POST /tasks` with `{"title": "Buy milk", "due_date": "2026-12-31"}`; when no date is picked, the request carries `"due_date": null`. (system AC-001.11)
- **AC-001.10** Given `POST /tasks` answers `201` with a task, when the person submitted the form, then that task appears at the end of the list without a page reload, "No tasks yet." disappears if it was shown, the title and date fields are emptied, no earlier error text remains, and after a reload the task is still shown. (system AC-001.11) (smoke)
- **AC-001.11** Given a person submits the title "  Buy milk  " (leading and trailing spaces), when the API answers `201` with the title "Buy milk", then the list shows "Buy milk" (the title from the API's response). (system AC-001.14)
- **AC-001.12** Given the task page, when a person submits the form with an empty title or a title of only spaces, then no request is sent to the Task API, nothing is added to the list, and the text "Please enter a title." is shown next to the title field. (system AC-001.12)
- **AC-001.13** Given the task page, when a person submits a title that has more than 200 characters after trimming, then no request is sent to the Task API and the text "The title can be at most 200 characters." is shown next to the title field; a title of exactly 200 characters after trimming (also when it is made of 200 emoji or other non-ASCII characters, counted as Unicode code points) is sent and accepted. (system AC-001.13)
- **AC-001.14** Given `POST /tasks` answers `422` with a `detail` entry whose `loc` contains `"title"`, when the person submitted the form, then the title message that fits the trimmed input is shown next to the title field ("Please enter a title." when it is empty, otherwise "The title can be at most 200 characters.") and nothing is added to the list. (system AC-001.12, AC-001.13)
- **AC-001.15** Given `POST /tasks` answers `503`, `500`, a `422` without `"title"` in any `loc`, a `201` whose body is not a task object, refuses the connection, or does not answer within 5 seconds, when a person submits a valid form, then the text "The task could not be saved. Please try again." is shown, the entered title and due date stay in the form, nothing is added to the list, exactly one `POST /tasks` was sent (no automatic retry), and no status code, response body or stack trace is shown. (system AC-001.15)
- **AC-001.16** Given a person uses the task page to load and add tasks, when the browser's network traffic is observed, then the browser never sends a request to the Task API's address; every call to the Task API is made by the web server. (system AC-001.6, AC-001.11)
- **AC-001.17** Given a person has submitted the form and the save is still in progress, when they press "Add task" again, then no second `POST /tasks` is sent (the button is disabled until the save finishes). (system AC-001.11, AC-001.15)

## Non-goals

- Editing, completing, deleting or reordering tasks.
- Pagination, search, filtering or sorting of the list in the web app.
- Locale-specific date formats (dates are shown as `YYYY-MM-DD` only).
- Live updates of the list while the page is open (tasks created elsewhere appear on reload, not automatically).
- Automatic retries of a failed load or save.
- Sign-in, users or permissions.
- Any change to the Task API, its database or its probes (covered by the API's and the gitops repo's slices of the system spec).

## Open questions

- ~~Confirm: the page's visible wording is the heading "Tasks", the field labels "Title" and "Due date (optional)" and the button "Add task".~~ Answered: yes, see AC-001.1.
- ~~Confirm: the starter page content (the "taskboard3-web" heading, the feature cards and the "Check health" link) is removed and replaced by the task page, while the site header and footer stay.~~ Answered: yes, see AC-001.1.
- ~~Confirm: the "Add task" button is disabled while a save is in progress, so a double click cannot create the task twice.~~ Answered: yes, see AC-001.17.

## Decisions taken during the ship

- Page wording (heading "Tasks", labels "Title" and "Due date (optional)", button "Add task"): yes, as suggested (AC-001.1).
- Starter page content removed and replaced by the task page, site header and footer kept: yes, as suggested (AC-001.1).
- "Add task" button disabled while a save is in progress: yes, as suggested (AC-001.17).

## Changelog

- 2026-11-05 created
- 2026-11-05 amended: the three Confirm questions were answered yes; AC-001.1 now states the field labels, the kept header and footer, and that the starter content is removed (same behaviour, stated more precisely); added "Decisions taken during the ship"
- 2026-11-05 approved
- 2026-11-05 building
