import { describe, expect, it } from "vitest";

import { load } from "./tasks-support";

type Lib = {
  validateTitle: (raw: string) => string | null;
  isTask: (v: unknown) => boolean;
  MESSAGES: Record<string, string>;
};
const lib = () => load<Lib>("app/_lib/task.ts");

describe("task helpers", () => {
  it("AC-001.12 validateTitle rejects empty and whitespace-only titles", async () => {
    const { validateTitle } = await lib();
    expect(validateTitle("")).toBe("title_required");
    expect(validateTitle("   \t")).toBe("title_required");
    expect(validateTitle("Buy milk")).toBeNull();
  });

  it("AC-001.13 validateTitle counts trimmed Unicode code points", async () => {
    const { validateTitle } = await lib();
    expect(validateTitle("a".repeat(200))).toBeNull();
    expect(validateTitle("a".repeat(201))).toBe("title_too_long");
    expect(validateTitle(` ${"a".repeat(200)} `)).toBeNull();
    expect(validateTitle("😀".repeat(200))).toBeNull();
    expect(validateTitle("😀".repeat(201))).toBe("title_too_long");
  });

  it("AC-001.7 the user-facing messages are the specified texts", async () => {
    const { MESSAGES } = await lib();
    expect(MESSAGES).toMatchObject({
      empty: "No tasks yet.",
      loadFailed: "Tasks could not be loaded. Please try again later.",
      saveFailed: "The task could not be saved. Please try again.",
      title_required: "Please enter a title.",
      title_too_long: "The title can be at most 200 characters.",
    });
  });

  it("AC-001.15 isTask accepts tasks and rejects anything else", async () => {
    const { isTask } = await lib();
    expect(isTask({ id: "1", title: "x", due_date: null })).toBe(true);
    expect(isTask({ id: "1", title: "x", due_date: "2026-12-31" })).toBe(true);
    expect(isTask({ id: "", title: "x", due_date: null })).toBe(false);
    expect(isTask({ id: "1", title: 3, due_date: null })).toBe(false);
    expect(isTask({ id: "1", title: "x", due_date: "31.12.2026" })).toBe(false);
    expect(isTask(null)).toBe(false);
    expect(isTask([])).toBe(false);
  });
});
