"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { isTask, MESSAGES, validateTitle } from "../_lib/task";
import type { Task, TitleError } from "../_lib/task";

export type TaskBoardProps = { initialTasks: Task[] | null };

export function TaskBoard({ initialTasks }: TaskBoardProps) {
  const loadFailed = initialTasks === null;
  const [tasks, setTasks] = useState<Task[]>(initialTasks ?? []);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState<TitleError | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTitleError(null);
    setSaveFailed(false);
    const invalid = validateTitle(title);
    if (invalid) {
      setTitleError(invalid);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, due_date: dueDate === "" ? null : dueDate }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 201 && isTask(body)) {
        const task: Task = { id: body.id, title: body.title, due_date: body.due_date };
        setTasks((current) => [...current, task]);
        setTitle("");
        setDueDate("");
      } else if (response.status === 422 && isTitleErrorBody(body)) {
        setTitleError(body.error);
      } else {
        setSaveFailed(true);
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form className="task-form" noValidate aria-label="Add task" onSubmit={onSubmit}>
        <div>
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleError ? "true" : undefined}
            aria-describedby={titleError ? "task-title-error" : undefined}
          />
          {titleError ? (
            <p id="task-title-error" className="field-error">
              {MESSAGES[titleError]}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="task-due-date">Due date (optional)</label>
          <input id="task-due-date" name="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Add task
        </button>
        {saveFailed ? (
          <p role="alert" className="form-alert">
            {MESSAGES.saveFailed}
          </p>
        ) : null}
      </form>
      {loadFailed ? (
        <p role="status">{MESSAGES.loadFailed}</p>
      ) : tasks.length === 0 ? (
        <p>{MESSAGES.empty}</p>
      ) : (
        <ul className="task-list" aria-label="Tasks">
          {tasks.map((task) => (
            <li key={task.id}>
              <span>{task.title}</span>
              {task.due_date !== null ? <time dateTime={task.due_date}>{task.due_date}</time> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function isTitleErrorBody(v: unknown): v is { error: TitleError } {
  if (typeof v !== "object" || v === null) return false;
  const error = (v as { error?: unknown }).error;
  return error === "title_required" || error === "title_too_long";
}
