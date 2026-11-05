# Environment variables

Configuration is read exclusively from environment variables. Defaults below are the application defaults. The deployed values are set per environment in the system's gitops-app repo (`system.yaml`: a component's `env`, and `replicas`, `resources` under `instances.<env>`).

## Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on. |
| `NODE_ENV` | `production` (in the image) | Node environment. |

## Observability

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset — tracing disabled)_ | OTLP endpoint; when set, `instrumentation.ts` enables OpenTelemetry tracing. |
| `OTEL_SERVICE_NAME` | `taskboard3-web` | Service name reported in traces. |

## Upstream APIs

| Variable | Default | Description |
|---|---|---|
| `TASKS_API_URL` | _(none)_ | Base URL of the Task API without a trailing slash. Server side only (never `NEXT_PUBLIC_`). Set by the gitops entry to `http://taskboard3-api`. When unset, the page shows the load error and every save fails. |

## Public (browser-exposed)

Variables prefixed `NEXT_PUBLIC_` are inlined into the client bundle at build time. Never put secrets in them.
