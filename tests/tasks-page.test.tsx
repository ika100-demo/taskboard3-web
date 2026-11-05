import { render, screen, within } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { API, load, stubTasksApi, type Reply } from "./tasks-support";

type PageModule = { default: () => Promise<JSX.Element>; dynamic?: string };

async function renderPage() {
  const mod = await load<PageModule>("app/page.tsx");
  render(await mod.default());
  return mod;
}

const T1 = { id: "a1", title: "Zebra care", due_date: "2026-12-31" };
const T2 = { id: "b2", title: "Apple pie", due_date: null };
const T3 = { id: "c3", title: "Mow lawn", due_date: "2026-01-02" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("task page (AC-001.1)", () => {
  it("AC-001.1 shows the task form and heading, none of the starter content, and exactly one state", async () => {
    stubTasksApi({ GET: { status: 200, body: [] } });
    await renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Due date (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "taskboard3-web" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Check health" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What's included" })).not.toBeInTheDocument();
    const states = [
      screen.queryByRole("list", { name: "Tasks" }),
      screen.queryByText("No tasks yet."),
      screen.queryByText("Tasks could not be loaded. Please try again later."),
    ].filter(Boolean);
    expect(states).toHaveLength(1);
  });
});

describe("task list", () => {
  it("AC-001.2 shows the tasks in the order the API returned them, never re-sorted", async () => {
    stubTasksApi({ GET: { status: 200, body: [T1, T2, T3] } });
    await renderPage();
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Zebra care");
    expect(items[0]).toHaveTextContent("2026-12-31");
    expect(items[1]).toHaveTextContent("Apple pie");
    expect(items[2]).toHaveTextContent("Mow lawn");
    expect(items[2]).toHaveTextContent("2026-01-02");
  });

  it("AC-001.2 drops fields the page does not know about", async () => {
    stubTasksApi({ GET: { status: 200, body: [{ ...T1, secret: "do-not-show-me" }] } });
    await renderPage();
    expect(screen.queryByText(/do-not-show-me/)).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent("Zebra care");
  });

  it("AC-001.3 asks the Task API on every render and is never cached", async () => {
    const { fetchStub } = stubTasksApi({ GET: { status: 200, body: [T1] } });
    const mod = await renderPage();
    expect(mod.dynamic).toBe("force-dynamic");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0][0]).toBe(`${API}/tasks`);
    expect(fetchStub.mock.calls[0][1]?.cache).toBe("no-store");
    expect(fetchStub.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    stubTasksApi({ GET: { status: 200, body: [T1, T3] } });
    render(await mod.default());
    const lists = screen.getAllByRole("list", { name: "Tasks" });
    expect(within(lists[lists.length - 1]).getAllByRole("listitem")).toHaveLength(2);
  });

  it("AC-001.4 shows no date and no placeholder for a task without due date", async () => {
    stubTasksApi({ GET: { status: 200, body: [T2] } });
    await renderPage();
    const item = within(screen.getByRole("list", { name: "Tasks" })).getByRole("listitem");
    expect(item.textContent?.trim()).toBe("Apple pie");
    expect(item.querySelector("time")).toBeNull();
    expect(item.textContent).not.toMatch(/null|undefined|Invalid|-|–|—/);
  });

  it.each(["Etc/GMT+12", "Etc/GMT-14", "UTC"])("AC-001.5 shows 2026-12-31 unchanged in time zone %s", async (tz) => {
    const before = process.env.TZ;
    process.env.TZ = tz;
    try {
      stubTasksApi({ GET: { status: 200, body: [T1] } });
      await renderPage();
      const item = within(screen.getByRole("list", { name: "Tasks" })).getByRole("listitem");
      expect(item).toHaveTextContent("2026-12-31");
      expect(item.querySelector("time")).toHaveTextContent(/^2026-12-31$/);
      expect(item.querySelector("time")).toHaveAttribute("datetime", "2026-12-31");
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it("AC-001.6 shows 'No tasks yet.' and no list for an empty result", async () => {
    stubTasksApi({ GET: { status: 200, body: [] } });
    await renderPage();
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("load failures (AC-001.7)", () => {
  const cases: [string, Reply][] = [
    ["503", { status: 503, body: { detail: "database unavailable" } }],
    ["500", { status: 500, body: { detail: "boom" } }],
    ["404", { status: 404, body: { detail: "Not Found" } }],
    ["200 with a JSON object", { status: 200, body: { detail: "boom" } }],
    ["200 with text that is not JSON", { status: 200, raw: "<html>gateway</html>" }],
    ["200 with an invalid task item", { status: 200, body: [{ id: "", title: 5, due_date: "tomorrow" }] }],
    ["a refused connection", { reject: true }],
  ];

  it.each(cases)("AC-001.7 shows the load error and still the form when the API answers %s", async (_name, reply) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    stubTasksApi({ GET: reply });
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/database unavailable|boom|gateway|503|500|404|TypeError|fetch failed/);
    errors.mockRestore();
  });

  it("AC-001.7 shows the load error when the API does not answer within 5 seconds", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchStub } = stubTasksApi({ GET: { hang: true } });
    await renderPage();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
    errors.mockRestore();
  }, 15_000);

  it("AC-001.7 shows the load error when TASKS_API_URL is not set", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    stubTasksApi({ GET: { status: 200, body: [] } });
    delete process.env.TASKS_API_URL;
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
    errors.mockRestore();
  });
});
