import { test, expect } from "@playwright/test";

// Bible Section 39 ("Keyboard and semantic accessibility are part of
// definition of done for core UI") — the Command Palette is the app's
// most keyboard-driven interaction, so it's the representative fix for
// that requirement (see docs/specs/command-palette-accessibility.md for
// the full scope boundary). This drives the whole flow via keyboard
// only — no mouse clicks — and asserts on real ARIA roles via
// getByRole, which only pass if the underlying semantics are actually
// correct, not just visually similar.
//
// One test, one login: every other file in this suite logs in once per
// file, not per test case — a real login rate limit now exists
// (docs/specs/rate-limiting.md, 10 attempts/15 min per IP). An earlier
// version of this file logged in fresh in a beforeEach for 4 separate
// test cases, which — combined with every other file's own login in the
// same `npm run test:e2e` run — tripped that limit and broke
// mfa.spec.ts's login with a real 429. Consolidated to match this
// suite's established one-login-per-file convention.
const OWNER_EMAIL = "consultingcedarpoint@gmail.com";
const OWNER_PASSWORD = "cedar-point-dev-only";

test("keyboard-only: dialog semantics, arrow/select, Enter navigates, then Tab trap and Escape-restore-focus", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const trigger = page.getByRole("button", { name: "Search…" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // --- Opens via keyboard shortcut with correct dialog semantics, focuses the input.
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const combobox = page.getByRole("combobox");
  await expect(combobox).toBeFocused();

  // --- Type and arrow through real results — aria-selected moves with
  // the keyboard, not just a visual highlight — then Enter navigates to
  // the active result's real page.
  await page.keyboard.type("Volt");
  const listbox = page.getByRole("listbox", { name: "Search results" });
  const firstOption = listbox.getByRole("option").first();
  await expect(firstOption).toBeVisible();
  await expect(firstOption).toHaveAttribute("aria-selected", "true");

  const optionCount = await listbox.getByRole("option").count();
  if (optionCount > 1) {
    await page.keyboard.press("ArrowDown");
    await expect(firstOption).toHaveAttribute("aria-selected", "false");
    await expect(listbox.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(firstOption).toHaveAttribute("aria-selected", "true");
  }

  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Volt Mobile" })).toBeVisible();

  // --- Escape closes the dialog and restores focus to the trigger button.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  // --- Tab is trapped inside the dialog rather than escaping to the
  // page behind it: forward through every option wraps back to the
  // input, and Shift+Tab from the input wraps to the last option.
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Volt");
  await expect(listbox.getByRole("option").first()).toBeVisible();
  const trapOptionCount = await listbox.getByRole("option").count();

  for (let i = 0; i < trapOptionCount; i++) {
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("Tab");
  await expect(combobox).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(listbox.getByRole("option").last()).toBeFocused();
});
