import { authenticator } from "otplib";
import { test, expect } from "@playwright/test";

// Bible Section 23.1's MFA, run end-to-end through the real UI: enroll
// a TOTP authenticator on the seeded owner account, confirm it with a
// real generated code (computed the same way mfa.integration.test.ts
// does at the service layer — otplib against the secret the page
// itself displays), then log out and back in to prove the account is
// actually challenged for a code on its next real login, not just that
// the enrollment API call succeeded.
const OWNER_EMAIL = "consultingcedarpoint@gmail.com";
const OWNER_PASSWORD = "cedar-point-dev-only";

test("enroll MFA, then a subsequent login is actually challenged for a real code", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/security");
  await page.getByRole("button", { name: /enable two-factor authentication/i }).click();

  const secret = (await page.locator("p.font-mono").first().textContent())!.trim();
  expect(secret.length).toBeGreaterThan(0);

  const enrollmentCode = authenticator.generate(secret);
  await page.locator("input").last().fill(enrollmentCode);
  await page.getByRole("button", { name: /confirm and enable/i }).click();

  await expect(page.getByText(/save your recovery codes now/i)).toBeVisible();
  await page.getByRole("button", { name: /i've saved these codes/i }).click();

  // Log out and back in — this is the real proof: does the account
  // actually get challenged now, using nothing but the login form a
  // real user would see.
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.locator('input[type="email"]').fill(OWNER_EMAIL);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();

  await expect(page.getByText(/enter the 6-digit code/i)).toBeVisible();
  // Password alone must not be enough — still on /login, not /dashboard.
  await expect(page).toHaveURL(/\/login/);

  const loginCode = authenticator.generate(secret);
  await page.locator("input").last().fill(loginCode);
  await page.getByRole("button", { name: /verify/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});
