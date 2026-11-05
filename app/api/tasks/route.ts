import { NextResponse } from "next/server";

import { validateTitle } from "@/app/_lib/task";
import { createTask } from "@/app/_lib/tasks-api";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badRequest() {
  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return badRequest();
  const { title, due_date: rawDue } = body as { title?: unknown; due_date?: unknown };
  if (typeof title !== "string") return badRequest();
  if (rawDue !== undefined && rawDue !== null && typeof rawDue !== "string") return badRequest();
  const due_date = rawDue === undefined || rawDue === null || rawDue === "" ? null : rawDue;
  if (due_date !== null && !DATE_RE.test(due_date)) return badRequest();

  const invalid = validateTitle(title);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const result = await createTask({ title, due_date });
  if (result.ok) return NextResponse.json(result.task, { status: 201 });
  if (result.reason === "title_invalid") {
    return NextResponse.json({ error: validateTitle(title) ?? "title_too_long" }, { status: 422 });
  }
  return NextResponse.json({ error: "save_failed" }, { status: 502 });
}
