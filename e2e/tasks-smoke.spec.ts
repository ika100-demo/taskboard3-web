import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

const LOAD_ERROR = "Tasks could not be loaded. Please try again later.";

test("AC-001.1 the task page loads at the root URL with exactly one list state @smoke", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(main.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await expect(main.getByLabel("Title")).toBeVisible();
  await expect(main.getByLabel("Due date (optional)")).toBeVisible();
  await expect(main.getByRole("button", { name: "Add task" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "taskboard3-web" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Check health" })).toHaveCount(0);
  const states =
    (await main.getByRole("list", { name: "Tasks" }).count()) +
    (await main.getByText("No tasks yet.").count()) +
    (await main.getByText(LOAD_ERROR).count());
  expect(states).toBe(1);
});

test("AC-001.10 an added task appears without reload and survives a reload @smoke @writes", async ({ page }) => {
  const title = `smoke-${randomUUID()}`;
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByText(LOAD_ERROR)).toHaveCount(0);
  await main.getByLabel("Title").fill(title);
  await main.getByLabel("Due date (optional)").fill("2026-12-31");
  await main.getByRole("button", { name: "Add task" }).click();
  const item = main.getByRole("listitem").filter({ hasText: title });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("2026-12-31");
  await expect(main.getByText("No tasks yet.")).toHaveCount(0);
  await expect(main.getByLabel("Title")).toHaveValue("");
  await expect(main.getByLabel("Due date (optional)")).toHaveValue("");
  await page.reload();
  await expect(main.getByRole("listitem").filter({ hasText: title })).toHaveCount(1);
});
