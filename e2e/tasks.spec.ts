import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// These tests run against the stub Task API (e2e/support/tasks-api-stub.mjs) that playwright.config.ts starts.
const stub = process.env.E2E_TASKS_API_URL ?? "";

test.skip(!!process.env.SMOKE_BASE_URL, "uses the stub Task API, not a deployment");

const LOAD_ERROR = "Tasks could not be loaded. Please try again later.";
const SAVE_ERROR = "The task could not be saved. Please try again.";
const EMPTY = "No tasks yet.";

type Override = { method: "GET" | "POST"; status?: number; body?: unknown; rawBody?: string; delayMs?: number; destroy?: boolean };
type Logged = { method: string; path: string; body: unknown };

async function control(request: APIRequestContext, method: "POST" | "PUT", path: string, data?: unknown) {
  const response = await request.fetch(`${stub}${path}`, { method, data });
  expect(response.ok(), `${method} ${path}`).toBeTruthy();
}
const seed = (request: APIRequestContext, tasks: unknown[]) => control(request, "PUT", "/__stub/tasks", tasks);
const override = (request: APIRequestContext, o: Override) => control(request, "PUT", "/__stub/override", o);
async function stubRequests(request: APIRequestContext): Promise<Logged[]> {
  return (await (await request.get(`${stub}/__stub/requests`)).json()) as Logged[];
}
async function posts(request: APIRequestContext) {
  return (await stubRequests(request)).filter((r) => r.method === "POST");
}

const main = (page: Page) => page.getByRole("main");
const taskList = (page: Page) => main(page).getByRole("list", { name: "Tasks" });
async function addTask(page: Page, title: string, due?: string) {
  await main(page).getByLabel("Title").fill(title);
  if (due) await main(page).getByLabel("Due date (optional)").fill(due);
  await main(page).getByRole("button", { name: "Add task" }).click();
}

test.beforeEach(async ({ request }) => {
  expect(stub, "E2E_TASKS_API_URL must point at the stub Task API").not.toBe("");
  await control(request, "POST", "/__stub/reset");
});

test("AC-001.1 the root URL shows the task page with header, footer, form and one list state", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main(page).getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await expect(main(page).getByLabel("Title")).toBeVisible();
  await expect(main(page).getByLabel("Due date (optional)")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Add task" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "taskboard3-web" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Check health" })).toHaveCount(0);
  await expect(main(page).getByText(EMPTY)).toBeVisible();
});

test("AC-001.2 the tasks appear in the order the API returned them", async ({ page, request }) => {
  await seed(request, [
    { id: "1", title: "Zebra care", due_date: "2026-12-31" },
    { id: "2", title: "Apple pie", due_date: null },
    { id: "3", title: "Mow lawn", due_date: "2026-01-02" },
  ]);
  await page.goto("/");
  const items = taskList(page).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Zebra care");
  await expect(items.nth(0)).toContainText("2026-12-31");
  await expect(items.nth(1)).toContainText("Apple pie");
  await expect(items.nth(2)).toContainText("Mow lawn");
  await expect(items.nth(2)).toContainText("2026-01-02");
});

test("AC-001.3 a task created through the API shows at the end after a reload", async ({ page, request }) => {
  await seed(request, [{ id: "1", title: "First", due_date: null }]);
  await page.goto("/");
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  const created = await request.post(`${stub}/tasks`, { data: { title: "Created elsewhere", due_date: null } });
  expect(created.status()).toBe(201);
  await page.reload();
  const items = taskList(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("Created elsewhere");
});

test("AC-001.4 a task without due date shows its title and nothing else", async ({ page, request }) => {
  await seed(request, [{ id: "1", title: "Just a title", due_date: null }]);
  await page.goto("/");
  const item = taskList(page).getByRole("listitem");
  await expect(item).toHaveText("Just a title");
});

for (const timezoneId of ["Etc/GMT+12", "Etc/GMT-14", "UTC"]) {
  test.describe(`time zone ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("AC-001.5 the due date 2026-12-31 is shown unchanged", async ({ page, request }) => {
      await seed(request, [{ id: "1", title: "New year", due_date: "2026-12-31" }]);
      await page.goto("/");
      await expect(taskList(page).getByRole("listitem")).toContainText("2026-12-31");
      await addTask(page, "Added", "2026-12-31");
      await expect(taskList(page).getByRole("listitem")).toHaveCount(2);
      await expect(taskList(page).getByRole("listitem").nth(1)).toContainText("2026-12-31");
    });
  });
}

test("AC-001.6 an empty list shows 'No tasks yet.' and no list", async ({ page }) => {
  await page.goto("/");
  await expect(main(page).getByText(EMPTY)).toBeVisible();
  await expect(main(page).getByRole("list")).toHaveCount(0);
});

const loadFailures: [string, Override][] = [
  ["503", { method: "GET", status: 503, body: { detail: "database unavailable" } }],
  ["500", { method: "GET", status: 500, body: { detail: "internal secret" } }],
  ["404", { method: "GET", status: 404, body: { detail: "Not Found" } }],
  ["200 with a non-array body", { method: "GET", status: 200, body: { detail: "internal secret" } }],
  ["a closed connection", { method: "GET", destroy: true }],
];
for (const [name, o] of loadFailures) {
  test(`AC-001.7 load error and form when GET /tasks answers ${name}`, async ({ page, request }) => {
    await override(request, o);
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(main(page).getByText(LOAD_ERROR)).toBeVisible();
    await expect(main(page).getByRole("list")).toHaveCount(0);
    await expect(main(page).getByLabel("Title")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/internal secret|database unavailable|Not Found|503|stack/);
  });
}

test("AC-001.7 load error when GET /tasks does not answer within 5 seconds", async ({ page, request }) => {
  test.setTimeout(30_000);
  await override(request, { method: "GET", status: 200, body: [], delayMs: 8000 });
  const response = await page.goto("/", { timeout: 20_000 });
  expect(response?.status()).toBe(200);
  await expect(main(page).getByText(LOAD_ERROR)).toBeVisible();
  await expect(main(page).getByLabel("Title")).toBeVisible();
});

test("AC-001.8 health and readiness answer 200 while the Task API is unavailable", async ({ request }) => {
  await override(request, { method: "GET", destroy: true });
  await override(request, { method: "POST", destroy: true });
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/api/ready")).status()).toBe(200);
  expect((await stubRequests(request)).length).toBe(0);
});

test("AC-001.9 submitting sends exactly one POST /tasks with title and due date", async ({ page, request }) => {
  await page.goto("/");
  await addTask(page, "Buy milk", "2026-12-31");
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  expect(await posts(request)).toEqual([{ method: "POST", path: "/tasks", body: { title: "Buy milk", due_date: "2026-12-31" } }]);
});

test("AC-001.9 submitting without a date sends due_date null", async ({ page, request }) => {
  await page.goto("/");
  await addTask(page, "Buy milk");
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  expect(await posts(request)).toEqual([{ method: "POST", path: "/tasks", body: { title: "Buy milk", due_date: null } }]);
});

test("AC-001.10 an added task appears at the end without reload, the form is emptied, and it survives a reload", async ({ page, request }) => {
  await seed(request, [{ id: "1", title: "First", due_date: null }]);
  await page.goto("/");
  await addTask(page, "Second", "2026-05-06");
  const items = taskList(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("Second");
  await expect(items.nth(1)).toContainText("2026-05-06");
  await expect(main(page).getByLabel("Title")).toHaveValue("");
  await expect(main(page).getByLabel("Due date (optional)")).toHaveValue("");
  await expect(main(page).getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(taskList(page).getByRole("listitem")).toHaveCount(2);
  await expect(taskList(page).getByRole("listitem").nth(1)).toContainText("Second");
});

test("AC-001.10 'No tasks yet.' disappears after the first task is added", async ({ page }) => {
  await page.goto("/");
  await expect(main(page).getByText(EMPTY)).toBeVisible();
  await addTask(page, "Only one");
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  await expect(main(page).getByText(EMPTY)).toHaveCount(0);
});

test("AC-001.10 an earlier error text is gone after a successful save", async ({ page, request }) => {
  await override(request, { method: "POST", status: 503, body: { detail: "database unavailable" } });
  await page.goto("/");
  await addTask(page, "Retry me");
  await expect(main(page).getByText(SAVE_ERROR)).toBeVisible();
  await control(request, "POST", "/__stub/reset");
  await main(page).getByRole("button", { name: "Add task" }).click();
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  await expect(main(page).getByText(SAVE_ERROR)).toHaveCount(0);
});

test("AC-001.11 the list shows the trimmed title from the API's response", async ({ page, request }) => {
  await page.goto("/");
  await addTask(page, "  Buy milk  ");
  await expect(taskList(page).getByRole("listitem")).toHaveText("Buy milk");
  expect((await posts(request))[0].body).toMatchObject({ title: "  Buy milk  " });
});

for (const [name, title] of [["empty", ""], ["only spaces", "    "]] as const) {
  test(`AC-001.12 ${name} title: message next to the field, no request, nothing added`, async ({ page, request }) => {
    await page.goto("/");
    await addTask(page, title);
    await expect(main(page).getByText("Please enter a title.")).toBeVisible();
    await expect(main(page).getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
    await expect(main(page).getByText(EMPTY)).toBeVisible();
    expect(await stubRequests(request).then((r) => r.filter((x) => x.method === "POST"))).toHaveLength(0);
  });
}

test("AC-001.13 a title of 201 characters is refused without a request", async ({ page, request }) => {
  await page.goto("/");
  await addTask(page, "a".repeat(201));
  await expect(main(page).getByText("The title can be at most 200 characters.")).toBeVisible();
  expect(await posts(request)).toHaveLength(0);
});

test("AC-001.13 titles of exactly 200 characters, also 200 emoji, are accepted", async ({ page, request }) => {
  await page.goto("/");
  await addTask(page, "a".repeat(200));
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  await addTask(page, "😀".repeat(200));
  await expect(taskList(page).getByRole("listitem")).toHaveCount(2);
  await expect(main(page).getByText("The title can be at most 200 characters.")).toHaveCount(0);
  expect(await posts(request)).toHaveLength(2);
});

test("AC-001.14 an upstream title 422 shows the title message and adds nothing", async ({ page, request }) => {
  await override(request, {
    method: "POST",
    status: 422,
    body: { detail: [{ type: "string_too_long", loc: ["body", "title"], msg: "too long", input: "x" }] },
  });
  await page.goto("/");
  await addTask(page, "Buy milk");
  await expect(main(page).getByText("The title can be at most 200 characters.")).toBeVisible();
  await expect(main(page).getByText(SAVE_ERROR)).toHaveCount(0);
  await expect(main(page).getByRole("list")).toHaveCount(0);
});

const saveFailures: [string, Override][] = [
  ["503", { method: "POST", status: 503, body: { detail: "database unavailable" } }],
  ["500", { method: "POST", status: 500, body: { detail: "internal secret" } }],
  ["422 without title", { method: "POST", status: 422, body: { detail: [{ type: "x", loc: ["body", "due_date"], msg: "bad", input: "x" }] } }],
  ["201 with a non-task body", { method: "POST", status: 201, body: { ok: true } }],
  ["a closed connection", { method: "POST", destroy: true }],
];
for (const [name, o] of saveFailures) {
  test(`AC-001.15 save error, kept input and one request when POST /tasks answers ${name}`, async ({ page, request }) => {
    await override(request, o);
    await page.goto("/");
    await addTask(page, "Buy milk", "2026-12-31");
    await expect(main(page).getByRole("alert")).toHaveText(SAVE_ERROR);
    await expect(main(page).getByLabel("Title")).toHaveValue("Buy milk");
    await expect(main(page).getByLabel("Due date (optional)")).toHaveValue("2026-12-31");
    await expect(main(page).getByRole("list")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/internal secret|database unavailable|\b503\b|\b500\b|stack/);
    expect(await posts(request)).toHaveLength(1);
  });
}

test("AC-001.15 save error when POST /tasks does not answer within 5 seconds, without retry", async ({ page, request }) => {
  test.setTimeout(30_000);
  await override(request, { method: "POST", status: 201, body: { id: "1", title: "Buy milk", due_date: null }, delayMs: 8000 });
  await page.goto("/");
  await addTask(page, "Buy milk");
  await expect(main(page).getByRole("alert")).toHaveText(SAVE_ERROR, { timeout: 15_000 });
  await expect(main(page).getByLabel("Title")).toHaveValue("Buy milk");
  await expect(main(page).getByRole("list")).toHaveCount(0);
  expect(await posts(request)).toHaveLength(1);
});

test("AC-001.16 the browser never calls the Task API, only the web server", async ({ page, baseURL }) => {
  const origins = new Set<string>();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));
  await page.goto("/");
  await addTask(page, "Buy milk");
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  expect(origins.has(new URL(stub).origin)).toBe(false);
  expect([...origins]).toEqual([new URL(baseURL ?? "").origin]);
});

test("AC-001.17 pressing 'Add task' again during a save sends no second request", async ({ page, request }) => {
  await override(request, { method: "POST", status: 201, body: { id: "1", title: "Buy milk", due_date: null }, delayMs: 1500 });
  await page.goto("/");
  await main(page).getByLabel("Title").fill("Buy milk");
  const button = main(page).getByRole("button", { name: "Add task" });
  await button.click();
  await expect(button).toBeDisabled();
  await button.click({ force: true }).catch(() => {});
  await page.keyboard.press("Enter").catch(() => {});
  await expect(taskList(page).getByRole("listitem")).toHaveCount(1);
  await expect(button).toBeEnabled();
  expect(await posts(request)).toHaveLength(1);
});
