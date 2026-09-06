import { test, expect } from "@playwright/test";

// Bible Section 32/35's critical end-to-end flow: login -> protected
// page -> logout, run against a real browser. Uses the seeded dev
// owner (see packages/db/prisma/seed.ts) — the suite's npm script
// resets the dev database to this known state immediately before
// running.
const OWNER_EMAIL = "consultingcedarpoint@gmail.com";
const OWNER_PASSWORD = "cedar-point-dev-only";

test("login, view a protected page, and log out", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "CEO Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("an unauthenticated visit to a protected page redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
