// Stub Task API for Playwright e2e tests (design 001, "E2E stub Task API"). Plain Node, no dependencies.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.E2E_TASKS_API_PORT);
if (!port) {
  console.error("E2E_TASKS_API_PORT is required");
  process.exit(1);
}

let tasks = [];
let overrides = {};
let requests = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function send(res, status, body, raw) {
  const payload = raw !== undefined ? raw : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validate(body) {
  const detail = [];
  const obj = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const title = obj.title;
  if (typeof title !== "string") {
    detail.push({ type: "string_type", loc: ["body", "title"], msg: "Input should be a valid string", input: title ?? null });
  } else {
    const trimmed = title.trim();
    const len = [...trimmed].length;
    if (len < 1) {
      detail.push({ type: "string_too_short", loc: ["body", "title"], msg: "String should have at least 1 character", input: title });
    } else if (len > 200) {
      detail.push({ type: "string_too_long", loc: ["body", "title"], msg: "String should have at most 200 characters", input: title });
    }
  }
  const due = obj.due_date;
  if (due !== undefined && due !== null) {
    let ok = typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due);
    if (ok) {
      const d = new Date(`${due}T00:00:00Z`);
      ok = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === due;
    }
    if (!ok) detail.push({ type: "date_from_datetime_parsing", loc: ["body", "due_date"], msg: "Input should be a valid date", input: due });
  }
  return { detail, obj };
}

async function handleTasks(req, res, method, bodyText) {
  const override = overrides[method];
  if (override) {
    if (override.delayMs) await sleep(override.delayMs);
    if (override.destroy) {
      req.socket.destroy();
      return;
    }
    if (override.rawBody !== undefined) return send(res, override.status ?? 200, undefined, override.rawBody);
    return send(res, override.status ?? 200, override.body);
  }
  if (method === "GET") return send(res, 200, tasks);
  const { detail, obj } = validate(parseJson(bodyText));
  if (detail.length) return send(res, 422, { detail });
  const task = { id: randomUUID(), title: obj.title.trim(), due_date: obj.due_date ?? null };
  tasks.push(task);
  return send(res, 201, task);
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://stub").pathname;
  const method = req.method ?? "GET";
  const bodyText = await readBody(req);

  if (path === "/health" && method === "GET") return send(res, 200, { status: "ok" });

  if (path === "/__stub/reset" && method === "POST") {
    tasks = [];
    overrides = {};
    requests = [];
    return send(res, 200, { ok: true });
  }
  if (path === "/__stub/tasks" && method === "PUT") {
    const list = parseJson(bodyText);
    if (!Array.isArray(list)) return send(res, 400, { error: "expected array" });
    tasks = list;
    return send(res, 200, { ok: true });
  }
  if (path === "/__stub/override" && method === "PUT") {
    const o = parseJson(bodyText);
    if (!o || (o.method !== "GET" && o.method !== "POST")) return send(res, 400, { error: "method must be GET or POST" });
    overrides[o.method] = o;
    return send(res, 200, { ok: true });
  }
  if (path === "/__stub/requests" && method === "GET") return send(res, 200, requests);

  if (path === "/tasks" && (method === "GET" || method === "POST")) {
    requests.push({ method, path, body: bodyText ? parseJson(bodyText) : null });
    return handleTasks(req, res, method, bodyText);
  }
  return send(res, 404, { detail: "Not Found" });
});

server.listen(port, "127.0.0.1", () => console.log(`tasks api stub on ${port}`));
