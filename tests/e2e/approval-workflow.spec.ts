import { test, expect } from "@playwright/test";

// Bible Section 15.1's approval workflow, run end-to-end through the
// real UI on the seeded dev client (Volt Mobile / FastCharge Launch /
// FastCharge 65W Launch — see packages/db/prisma/seed.ts): create a
// creative, request approval, and record a real decision. Navigates by
// visible link text rather than hardcoded ids, so it survives a fresh
// db:reset (new ids every run).
const OWNER_EMAIL = "consultingcedarpoint@gmail.com";
const OWNER_PASSWORD = "cedar-point-dev-only";
const PLATFORM_MARKER = `e2e-platform-${Date.now()}`;

test("create a creative, request approval, and approve it", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/clients");
  await page.getByRole("link", { name: /Volt Mobile/ }).click();
  await page.getByRole("link", { name: /FastCharge Launch/ }).click();
  await page.getByRole("link", { name: /FastCharge 65W Launch/ }).click();

  // Add a new creative — starts life at DRAFT (Creative.status default).
  await page.locator('input[placeholder="instagram_feed"]').fill(PLATFORM_MARKER);
  await page.locator('input[placeholder="First draft description"]').fill("E2E test creative");
  await page.getByRole("button", { name: /add creative/i }).click();

  const creativeRow = page.getByRole("link", { name: new RegExp(PLATFORM_MARKER) });
  await expect(creativeRow).toBeVisible();
  await expect(creativeRow).toContainText("DRAFT");
  await creativeRow.click();

  // Real request-approval step: a fresh creative has no Approval row at
  // all until this happens (Section 15.1's actual lifecycle start).
  await expect(page.getByRole("button", { name: /request approval/i })).toBeVisible();
  await page.getByRole("button", { name: /request approval/i }).click();

  // The creative's own status badge (not just the button) confirms the
  // real service transition happened, not just an optimistic UI change.
  await expect(page.getByText("PENDING_APPROVAL").first()).toBeVisible();

  // Record a real decision — the default selection is "Approve".
  await page.getByRole("button", { name: /record decision/i }).click();

  await expect(page.getByText(/this version is approved/i)).toBeVisible();
  await expect(page.getByText("APPROVED").first()).toBeVisible();
});
