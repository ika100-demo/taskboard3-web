import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { load, stubBrowserFetch } from "./tasks-support";

type Task = { id: string; title: string; due_date: string | null };
type BoardModule = { TaskBoard: (props: { initialTasks: Task[] | null }) => JSX.Element };

const MSG = {
  empty: "No tasks yet.",
  saveFailed: "The task could not be saved. Please try again.",
  required: "Please enter a title.",
  tooLong: "The title can be at most 200 characters.",
};

async function board(initialTasks: Task[] | null = []) {
  const mod = await load<BoardModule>("app/_components/task-board.tsx");
  render(<mod.TaskBoard initialTasks={initialTasks} />);
}

function fill(title: string, due?: string) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  if (due !== undefined) fireEvent.change(screen.getByLabelText("Due date (optional)"), { target: { value: due } });
}
function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
}
const items = () => within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");

afterEach(() => vi.unstubAllGlobals());

describe("TaskBoard states", () => {
  it("AC-001.6 renders 'No tasks yet.' for an empty list", async () => {
    stubBrowserFetch({ status: 500 });
    await board([]);
    expect(screen.getByText(MSG.empty)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("AC-001.7 renders the load error (and the form) for null", async () => {
    stubBrowserFetch({ status: 500 });
    await board(null);
    expect(screen.getByRole("status")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.4 renders no date for a null due date and the plain string for a date", async () => {
    stubBrowserFetch({ status: 500 });
    await board([
      { id: "1", title: "No date", due_date: null },
      { id: "2", title: "With date", due_date: "2026-12-31" },
    ]);
    const [first, second] = items();
    expect(first.textContent?.trim()).toBe("No date");
    expect(second).toHaveTextContent("2026-12-31");
  });
});

describe("TaskBoard submit", () => {
  it("AC-001.9 posts the title and date to the app's own /api/tasks once", async () => {
    const { calls } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill("Buy milk", "2026-12-31");
    submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toMatch(/\/api\/tasks$/);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ title: "Buy milk", due_date: "2026-12-31" });
  });

  it("AC-001.9 posts due_date null when no date is picked", async () => {
    const { calls } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill("Buy milk");
    submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.16 the browser only ever calls /api/tasks, never the Task API", async () => {
    const { fetchStub } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill("Buy milk");
    submit();
    await screen.findByRole("list", { name: "Tasks" });
    for (const [url] of fetchStub.mock.calls) expect(String(url)).toMatch(/(^|\/\/[^/]+)\/api\/tasks$/);
  });

  it("AC-001.10 appends the task, hides 'No tasks yet.', empties the fields and clears earlier errors", async () => {
    let n = 0;
    stubBrowserFetch(() => (n++ === 0 ? { status: 502, body: { error: "save_failed" } } : { status: 201, echo: true }));
    await board([]);
    fill("Buy milk", "2026-12-31");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(MSG.saveFailed);
    submit();
    await screen.findByRole("list", { name: "Tasks" });
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent("Buy milk");
    expect(items()[0]).toHaveTextContent("2026-12-31");
    expect(screen.queryByText(MSG.empty)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Due date (optional)")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(MSG.saveFailed)).not.toBeInTheDocument();
  });

  it("AC-001.10 appends at the end of an existing list", async () => {
    stubBrowserFetch({ status: 201, echo: true });
    await board([{ id: "1", title: "First", due_date: null }]);
    fill("Second");
    submit();
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items()[0]).toHaveTextContent("First");
    expect(items()[1]).toHaveTextContent("Second");
  });

  it("AC-001.11 shows the title from the API's response, not the typed one", async () => {
    stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill("  Buy milk  ");
    submit();
    await screen.findByRole("list", { name: "Tasks" });
    expect(items()[0].textContent?.trim()).toBe("Buy milk");
  });

  it("AC-001.11 sends the title as typed", async () => {
    const { calls } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill("  Buy milk  ");
    submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0].body as { title: string }).title).toBe("  Buy milk  ");
  });
});

describe("TaskBoard client validation", () => {
  it.each(["", "   "])("AC-001.12 shows 'Please enter a title.' next to the field and sends nothing for %j", async (title) => {
    const { calls } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill(title);
    submit();
    const input = screen.getByLabelText("Title");
    const message = await screen.findByText(MSG.required);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "task-title-error");
    expect(message).toHaveAttribute("id", "task-title-error");
    expect(input.nextElementSibling).toBe(message);
    expect(calls).toHaveLength(0);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(MSG.empty)).toBeInTheDocument();
  });

  it("AC-001.12 does not use native validation that would hide the app's own message", async () => {
    stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    const input = screen.getByLabelText("Title");
    expect(input).not.toBeRequired();
    expect(input).not.toHaveAttribute("maxlength");
    expect(screen.getByRole("form", { name: "Add task" })).toHaveAttribute("novalidate");
  });

  it("AC-001.13 refuses 201 characters with the length message and sends nothing", async () => {
    const { calls } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill(`  ${"a".repeat(201)} `);
    submit();
    expect(await screen.findByText(MSG.tooLong)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["200 ASCII characters", "a".repeat(200)],
    ["200 emoji", "😀".repeat(200)],
    ["200 characters padded with spaces", ` ${"a".repeat(200)} `],
  ])("AC-001.13 sends %s", async (_n, title) => {
    const { calls } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill(title);
    submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByText(MSG.tooLong)).not.toBeInTheDocument();
    await screen.findByRole("list", { name: "Tasks" });
  });

  it("AC-001.13 refuses 201 emoji", async () => {
    const { calls } = stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill("😀".repeat(201));
    submit();
    expect(await screen.findByText(MSG.tooLong)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("AC-001.12 clears the title error on the next valid submit", async () => {
    stubBrowserFetch({ status: 201, echo: true });
    await board([]);
    fill("");
    submit();
    await screen.findByText(MSG.required);
    fill("Buy milk");
    submit();
    await screen.findByRole("list", { name: "Tasks" });
    expect(screen.queryByText(MSG.required)).not.toBeInTheDocument();
  });
});

describe("TaskBoard server-side title rejection", () => {
  it.each([
    ["title_too_long", MSG.tooLong],
    ["title_required", MSG.required],
  ])("AC-001.14 shows the message for %s next to the title field and adds nothing", async (code, text) => {
    stubBrowserFetch({ status: 422, body: { error: code } });
    await board([]);
    fill("Buy milk");
    submit();
    const message = await screen.findByText(text);
    expect(screen.getByLabelText("Title").nextElementSibling).toBe(message);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText(MSG.saveFailed)).not.toBeInTheDocument();
  });
});

describe("TaskBoard save failures", () => {
  const failures: [string, Parameters<typeof stubBrowserFetch>[0]][] = [
    ["502", { status: 502, body: { error: "save_failed" } }],
    ["500", { status: 500, body: { error: "x" } }],
    ["422 with an unknown code", { status: 422, body: { error: "something" } }],
    ["201 with a non-task body", { status: 201, body: { nope: true } }],
    ["a thrown fetch", { reject: true }],
  ];

  it.each(failures)("AC-001.15 shows the save error, keeps the input and adds nothing on %s", async (_n, reply) => {
    const { calls } = stubBrowserFetch(reply);
    await board([{ id: "1", title: "First", due_date: null }]);
    fill("Buy milk", "2026-12-31");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(MSG.saveFailed);
    expect(screen.getByLabelText("Title")).toHaveValue("Buy milk");
    expect(screen.getByLabelText("Due date (optional)")).toHaveValue("2026-12-31");
    expect(items()).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/502|500|save_failed|TypeError|fetch failed/);
  });

  it("AC-001.15 re-enables the button after a failure", async () => {
    stubBrowserFetch({ status: 502, body: { error: "save_failed" } });
    await board([]);
    fill("Buy milk");
    submit();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
  });

  it("load failed, then a save succeeds: the load error stays and the form is cleared", async () => {
    stubBrowserFetch({ status: 201, echo: true });
    await board(null);
    fill("Buy milk");
    submit();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
    expect(screen.getByRole("status")).toHaveTextContent("Tasks could not be loaded. Please try again later.");
  });
});

describe("TaskBoard pending state", () => {
  it("AC-001.17 disables the button while saving and sends no second request", async () => {
    let release: (r: Response) => void = () => {};
    const { calls } = stubBrowserFetch(() => new Promise<Response>((resolve) => (release = resolve)));
    await board([]);
    fill("Buy milk");
    submit();
    const button = screen.getByRole("button", { name: "Add task" });
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    fireEvent.submit(screen.getByRole("form", { name: "Add task" }));
    expect(calls).toHaveLength(1);
    await act(async () => {
      release(new Response(JSON.stringify({ id: "1", title: "Buy milk", due_date: null }), { status: 201, headers: { "Content-Type": "application/json" } }));
    });
    await screen.findByRole("list", { name: "Tasks" });
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
    expect(calls).toHaveLength(1);
  });
});
