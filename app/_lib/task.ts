export type Task = { id: string; title: string; due_date: string | null };

export function isTask(v: unknown): v is Task {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id === "") return false;
  if (typeof o.title !== "string") return false;
  return o.due_date === null || (typeof o.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.due_date));
}

export type TitleError = "title_required" | "title_too_long";

export function validateTitle(raw: string): TitleError | null {
  const length = [...raw.trim()].length;
  if (length === 0) return "title_required";
  if (length > 200) return "title_too_long";
  return null;
}

export const MESSAGES = {
  empty: "No tasks yet.",
  loadFailed: "Tasks could not be loaded. Please try again later.",
  saveFailed: "The task could not be saved. Please try again.",
  title_required: "Please enter a title.",
  title_too_long: "The title can be at most 200 characters.",
} as const;
