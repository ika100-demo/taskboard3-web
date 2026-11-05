import { isTask, type Task } from "./task";

export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "title_invalid" }
  | { ok: false; reason: "failed" };

function logFailure(op: "list" | "create", status: number | null, error: string): void {
  console.error(JSON.stringify({ level: "error", msg: "tasks_api_call_failed", op, status, error }));
}

function tasksUrl(): string | null {
  const base = process.env.TASKS_API_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/tasks`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

export async function listTasks(): Promise<ListResult> {
  let status: number | null = null;
  try {
    const url = tasksUrl();
    if (!url) {
      logFailure("list", null, "TASKS_API_URL is not set");
      return { ok: false };
    }
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    status = res.status;
    if (status !== 200) {
      logFailure("list", status, `unexpected status ${status}`);
      return { ok: false };
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data) || !data.every(isTask)) {
      logFailure("list", status, "response is not an array of tasks");
      return { ok: false };
    }
    return { ok: true, tasks: data.map((t) => ({ id: t.id, title: t.title, due_date: t.due_date })) };
  } catch (e) {
    logFailure("list", status, errorText(e));
    return { ok: false };
  }
}

function hasTitleLoc(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const detail = (body as { detail?: unknown }).detail;
  if (!Array.isArray(detail)) return false;
  return detail.some((entry) => {
    const loc = (entry as { loc?: unknown } | null)?.loc;
    return Array.isArray(loc) && loc.includes("title");
  });
}

export async function createTask(input: { title: string; due_date: string | null }): Promise<CreateResult> {
  let status: number | null = null;
  try {
    const url = tasksUrl();
    if (!url) {
      logFailure("create", null, "TASKS_API_URL is not set");
      return { ok: false, reason: "failed" };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    status = res.status;
    const data: unknown = await res.json().catch(() => null);
    if (status === 201 && isTask(data)) {
      return { ok: true, task: { id: data.id, title: data.title, due_date: data.due_date } };
    }
    if (status === 422 && hasTitleLoc(data)) {
      logFailure("create", status, "title rejected by the Task API");
      return { ok: false, reason: "title_invalid" };
    }
    logFailure("create", status, status === 201 ? "response is not a task" : `unexpected status ${status}`);
    return { ok: false, reason: "failed" };
  } catch (e) {
    logFailure("create", status, errorText(e));
    return { ok: false, reason: "failed" };
  }
}
