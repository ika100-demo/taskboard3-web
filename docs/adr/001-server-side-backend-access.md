# ADR-001: Backend APIs are called only from the web server, and tests stub them at their base URL

## Status

Accepted (spec 001).

## Context

The web app is the UI for backend services of the system, starting with the Task API (`TASKS_API_URL=http://taskboard3-api`). That address is a cluster-internal Service name the browser cannot reach, and exposing backends to the browser would add CORS, a second public surface and leak upstream errors. The web tests must run without any backend.

## Decision

- Every backend call is made by the Next.js server: Server Components read data during rendering; writes go from the browser to a route handler of this app under `app/api/<resource>/route.ts`, which calls the backend. No Server Actions for backend writes, no `NEXT_PUBLIC_*` backend URLs.
- Backend clients live in `app/_lib/<backend>-api.ts`, read their base URL from an environment variable at call time, use `cache: "no-store"` and an `AbortSignal.timeout`, never throw (they return a result union), and log failures as one JSON line on the server. The browser only ever sees this app's own small error codes.
- `/api/health` and `/api/ready` never check backends.
- Unit and component tests stub `fetch` for URLs under the backend's base URL; Playwright starts a stub backend from `e2e/support/` and points the app's base-URL variable at it.

## Consequences

- One place per backend for timeouts, validation of responses and logging; the browser bundle contains no backend addresses.
- Each write needs a small route handler with its own documented contract.
- E2E runs need the stub server and a single worker while it holds shared state.
