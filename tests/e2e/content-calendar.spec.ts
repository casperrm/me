import { test, expect } from "@playwright/test";

// Bible Section 9's Content Calendar workflow, run end-to-end: create a
// content item (starts at BRIEF) and move it through two real,
// server-validated transitions. content-calendar-service.ts enforces
// ALLOWED_TRANSITIONS server-side regardless of what the UI's dropdown
// offers (see ContentItemStatusForm.tsx's own comment) — this test
// proves the real transition chain via the actual UI, not just that a
// button click did something.
const OWNER_EMAIL = "consultingcedarpoint@gmail.com";
const OWNER_PASSWORD = "cedar-point-dev-only";
const TITLE_MARKER = `E2E content item ${Date.now()}`;

test("create a content item and move it BRIEF -> DRAFT -> INTERNAL_REVIEW", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/clients");
  await page.getByRole("link", { name: /Volt Mobile/ }).click();
  await page.getByRole("link", { name: /Content Calendar/i }).click();

  await page.getByRole("button", { name: /new content item/i }).click();
  await page.locator('input[placeholder="Title"]').fill(TITLE_MARKER);
  await page.getByRole("button", { name: /add to plan/i }).click();

  const row = page.getByRole("row", { name: new RegExp(TITLE_MARKER) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("BRIEF");

  // BRIEF -> DRAFT: the dropdown's only option is already selected by
  // the component's own default (ALLOWED_TRANSITIONS[status][0]).
  await row.getByRole("button", { name: /move/i }).click();
  await expect(row).toContainText("DRAFT");

  // DRAFT -> INTERNAL_REVIEW: same pattern, a real second transition.
  await row.getByRole("button", { name: /move/i }).click();
  await expect(row).toContainText("INTERNAL_REVIEW");
});
