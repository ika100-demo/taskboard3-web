import { vi } from "vitest";

// Shared helpers for the acceptance tests of spec 001. Modules under test are loaded with a computed path so that
// a missing module fails the single test that needs it instead of breaking the collection of the whole file.
export async function load<T = Record<string, unknown>>(relative: string): Promise<T> {
  const path = `${process.cwd()}/${relative}`;
  return (await import(/* @vite-ignore */ path)) as T;
}

export const API = "http://tasks-api.test";

export type Reply = {
  status?: number;
  body?: unknown;
  raw?: string;
  reject?: boolean;
  hang?: boolean;
  /** Answer with the request's own JSON body (plus an id) after trimming the title, like the real API. */
  echo?: boolean;
};

export type Call = { url: string; method: string; body: unknown; init: RequestInit };

/** Stub the global fetch for URLs under TASKS_API_URL. Any other URL fails the test. */
export function stubTasksApi(replies: { GET?: Reply; POST?: Reply }) {
  process.env.TASKS_API_URL = API;
  const calls: Call[] = [];
  const respond = (reply: Reply, call: Call): Promise<Response> => {
    if (reply.hang) {
      return new Promise((_, reject) => {
        const signal = call.init.signal;
        if (signal) signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")));
      });
    }
    if (reply.reject) return Promise.reject(new TypeError("fetch failed"));
    let payload: string;
    if (reply.echo) {
      const sent = call.body as { title: string; due_date: string | null };
      payload = JSON.stringify({ id: "id-echo", title: sent.title.trim(), due_date: sent.due_date ?? null });
    } else {
      payload = reply.raw ?? JSON.stringify(reply.body ?? null);
    }
    return Promise.resolve(new Response(payload, { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } }));
  };
  const fetchStub = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${API}/tasks`)) return Promise.reject(new Error(`unexpected fetch to ${url}`));
    const method = (init.method ?? "GET").toUpperCase() as "GET" | "POST";
    const call: Call = { url, method, body: typeof init.body === "string" ? JSON.parse(init.body) : null, init };
    calls.push(call);
    return respond(replies[method] ?? { status: 404, body: { detail: "Not Found" } }, call);
  });
  vi.stubGlobal("fetch", fetchStub);
  return { calls, fetchStub };
}

/** Stub the browser side of the board: only the app's own /api/tasks may be called. */
export function stubBrowserFetch(reply: Reply | ((call: Call) => Reply | Promise<Response>)) {
  const calls: Call[] = [];
  const fetchStub = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const call: Call = { url, method: (init.method ?? "GET").toUpperCase(), body: typeof init.body === "string" ? JSON.parse(init.body) : null, init };
    calls.push(call);
    if (url !== "/api/tasks" && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/tasks$/.test(url)) {
      return Promise.reject(new Error(`the browser must only call /api/tasks, got ${url}`));
    }
    const r = typeof reply === "function" ? reply(call) : reply;
    if (r instanceof Promise) return r;
    if (r.reject) return Promise.reject(new TypeError("fetch failed"));
    let payload: string;
    if (r.echo) {
      const sent = call.body as { title: string; due_date: string | null };
      payload = JSON.stringify({ id: `id-${calls.length}`, title: sent.title.trim(), due_date: sent.due_date ?? null });
    } else {
      payload = r.raw ?? JSON.stringify(r.body ?? null);
    }
    return Promise.resolve(new Response(payload, { status: r.status ?? 200, headers: { "Content-Type": "application/json" } }));
  });
  vi.stubGlobal("fetch", fetchStub);
  return { calls, fetchStub };
}
