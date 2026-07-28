import { expect, test } from "@playwright/test";

import {
  expectNoAccessibilityViolations,
  expectNoHorizontalOverflow,
} from "./a11y";

const TASK_ROUTES = [
  { path: "/task/study", title: "Study help" },
  { path: "/task/coding", title: "Coding help" },
  { path: "/task/career", title: "Career help" },
  { path: "/task/pick-my-bowl", title: "Pick My Bowl" },
] as const;

test("redeemed wallet is reusable, accessible, and responsive", async ({
  page,
}) => {
  await page.goto("/wallet");
  await expect(
    page.getByRole("heading", {
      name: "What will you build first?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("2,879", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("4% of 3,000 credits used"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, "/wallet");
  await expectNoAccessibilityViolations(page, "/wallet");
});

for (const taskRoute of TASK_ROUTES) {
  test(`${taskRoute.path} is reusable, accessible, and responsive`, async ({
    page,
  }) => {
    await page.goto(taskRoute.path);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: taskRoute.title,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate" }),
    ).toBeVisible();
    await expect(page.getByText("2,879 credits")).toBeVisible();
    await expectNoHorizontalOverflow(page, taskRoute.path);
    await expectNoAccessibilityViolations(page, taskRoute.path);
  });
}

test("saved history is reusable, accessible, and responsive", async ({
  page,
}) => {
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { level: 1, name: "Build history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Your study guide",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Key ideas" }),
  ).toBeVisible();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Result not saved · prompt not retained"),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "/history");
  await expectNoAccessibilityViolations(page, "/history");
});

test("legacy OpenRouter route redirects to the YGF Agent setup", async ({
  page,
}) => {
  await page.goto("/connect/openrouter");
  await expect(page).toHaveURL(/\/connect\/agent$/);
  await expect(
    page.getByRole("heading", {
      name: "Connect your own Agent",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, "/connect/agent");
  await expectNoAccessibilityViolations(page, "/connect/agent");
});

test("Agent setup is reusable, accessible, and responsive", async ({
  page,
}) => {
  await page.goto("/connect/agent");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Connect your own Agent",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Developer API key",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("2,879", { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, "/connect/agent");
  await expectNoAccessibilityViolations(page, "/connect/agent");
});

test("safe check-in card is reusable, accessible, and responsive", async ({
  page,
}) => {
  await page.goto("/share");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Create your check-in card",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download SVG card" }),
  ).toBeVisible();
  await expect(
    page.getByText("Nothing is posted automatically."),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, "/share");
  await expectNoAccessibilityViolations(page, "/share");
});
