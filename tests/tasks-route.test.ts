import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/ready/route";

import { API, load, stubTasksApi, type Reply } from "./tasks-support";

type RouteModule = { POST: (request: Request) => Promise<Response>; dynamic?: string };

async function post(body: unknown, raw?: string) {
  const mod = await load<RouteModule>("app/api/tasks/route.ts");
  const response = await mod.POST(
    new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ?? JSON.stringify(body),
    }),
  );
  return { response, mod };
}

const upstreamTitle422 = {
  status: 422,
  body: { detail: [{ type: "string_too_short", loc: ["body", "title"], msg: "too short", input: "" }] },
} satisfies Reply;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/tasks forwards to the Task API", () => {
  it("AC-001.9 sends exactly one POST /tasks with the title as typed and the due date", async () => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    const { response, mod } = await post({ title: "Buy milk", due_date: "2026-12-31" });
    expect(mod.dynamic).toBe("force-dynamic");
    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API}/tasks`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ title: "Buy milk", due_date: "2026-12-31" });
    expect(new Headers(calls[0].init.headers).get("content-type")).toContain("application/json");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it.each([[null], [undefined], [""]])("AC-001.9 sends due_date null when no date is picked (%s)", async (due) => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    await post({ title: "Buy milk", due_date: due });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.10 answers 201 with the created task reduced to id, title and due_date", async () => {
    stubTasksApi({ POST: { status: 201, body: { id: "x1", title: "Buy milk", due_date: null, extra: "x" } } });
    const { response } = await post({ title: "Buy milk", due_date: null });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "x1", title: "Buy milk", due_date: null });
  });

  it("AC-001.11 passes the title untrimmed to the API and returns the API's trimmed title", async () => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    const { response } = await post({ title: "  Buy milk  ", due_date: null });
    expect(calls[0].body).toEqual({ title: "  Buy milk  ", due_date: null });
    expect(((await response.json()) as { title: string }).title).toBe("Buy milk");
  });
});

describe("POST /api/tasks validates the title", () => {
  it.each(["", "   ", "\t\n "])("AC-001.12 answers 422 title_required without calling the API for %j", async (title) => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    const { response } = await post({ title, due_date: null });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "title_required" });
    expect(calls).toHaveLength(0);
  });

  it("AC-001.13 answers 422 title_too_long for 201 characters without calling the API", async () => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    const { response } = await post({ title: "a".repeat(201), due_date: null });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "title_too_long" });
    expect(calls).toHaveLength(0);
  });

  it("AC-001.13 trims before counting: 200 characters plus spaces are accepted", async () => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    const { response } = await post({ title: `  ${"a".repeat(200)}  `, due_date: null });
    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
  });

  it("AC-001.13 counts Unicode code points: 200 emoji are accepted, 201 are not", async () => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    const ok = await post({ title: "😀".repeat(200), due_date: null });
    expect(ok.response.status).toBe(201);
    expect(calls).toHaveLength(1);
    const tooLong = await post({ title: "😀".repeat(201), due_date: null });
    expect(tooLong.response.status).toBe(422);
    expect(await tooLong.response.json()).toEqual({ error: "title_too_long" });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["not JSON", undefined, "{not json"],
    ["title not a string", { title: 5, due_date: null }, undefined],
    ["due_date neither string nor null", { title: "x", due_date: 20261231 }, undefined],
  ])("AC-001.9 answers 400 bad_request without calling the API when the body is invalid (%s)", async (_n, body, raw) => {
    const { calls } = stubTasksApi({ POST: { status: 201, echo: true } });
    const { response } = await post(body, raw);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request" });
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/tasks maps upstream 422", () => {
  it("AC-001.14 falls back to title_too_long when the title passes the local check", async () => {
    stubTasksApi({ POST: upstreamTitle422 });
    const { response } = await post({ title: "x", due_date: null });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "title_too_long" });
  });

  it("AC-001.14 maps an upstream title 422 to the code that fits the trimmed input", async () => {
    stubTasksApi({ POST: upstreamTitle422 });
    const { response } = await post({ title: "b".repeat(201), due_date: null });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "title_too_long" });
  });
});

describe("POST /api/tasks upstream failures", () => {
  const failures: [string, Reply][] = [
    ["503", { status: 503, body: { detail: "database unavailable" } }],
    ["500", { status: 500, body: { detail: "internal secret" } }],
    ["404", { status: 404, body: { detail: "Not Found" } }],
    ["422 without title in loc", { status: 422, body: { detail: [{ type: "x", loc: ["body", "due_date"], msg: "bad date", input: "x" }] } }],
    ["201 with a body that is not a task", { status: 201, body: { ok: true } }],
    ["201 with a non-JSON body", { status: 201, raw: "oops" }],
    ["a refused connection", { reject: true }],
  ];

  it.each(failures)("AC-001.15 answers 502 save_failed, leaks nothing and calls the API once for %s", async (_n, reply) => {
    const { calls } = stubTasksApi({ POST: reply });
    const { response } = await post({ title: "Buy milk", due_date: "2026-12-31" });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "save_failed" });
    expect(text).not.toMatch(/secret|database|Not Found|bad date/);
    expect(calls).toHaveLength(1);
  });

  it("AC-001.15 answers 502 save_failed when the API does not answer within 5 seconds, without retry", async () => {
    const { calls } = stubTasksApi({ POST: { hang: true } });
    const { response } = await post({ title: "Buy milk", due_date: null });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "save_failed" });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  }, 15_000);

  it("AC-001.15 logs the failure on the server as one JSON line", async () => {
    stubTasksApi({ POST: { status: 503, body: { detail: "database unavailable" } } });
    await post({ title: "Buy milk", due_date: null });
    const lines = vi.mocked(console.error).mock.calls.map((c) => String(c[0]));
    const entry = lines.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } }).find((e) => e?.msg === "tasks_api_call_failed");
    expect(entry).toMatchObject({ level: "error", msg: "tasks_api_call_failed", op: "create", status: 503 });
  });
});

describe("probes do not depend on the Task API", () => {
  it("AC-001.8 /api/health and /api/ready answer 200 while the Task API is unavailable", async () => {
    const { fetchStub } = stubTasksApi({ GET: { reject: true }, POST: { reject: true } });
    expect(health().status).toBe(200);
    expect(ready().status).toBe(200);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
