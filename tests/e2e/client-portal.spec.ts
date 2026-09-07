import { test, expect } from "@playwright/test";

// Bible Section 15.2's Client Portal, run end-to-end: an owner invites
// an external contact scoped to exactly one client, the contact accepts
// and lands in a real session, and — the real security guarantee this
// test exists to prove — that session is redirected away from the
// internal app (CEO Dashboard, Clients list) back to /portal every time,
// not just on first login. auth.spec.ts already covers the
// unauthenticated redirect; this covers the authenticated-but-restricted
// one, a meaningfully different guarantee (Section 38).
const OWNER_EMAIL = "consultingcedarpoint@gmail.com";
const OWNER_PASSWORD = "cedar-point-dev-only";

test("a Client Portal invite lands in a scoped session that can never reach the internal app", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();

  await ownerPage.goto("/login");
  await ownerPage.locator('input[type="email"]').fill(OWNER_EMAIL);
  await ownerPage.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await ownerPage.getByRole("button", { name: /log in/i }).click();
  await expect(ownerPage).toHaveURL(/\/dashboard/);

  await ownerPage.goto("/team");
  const uniqueEmail = `e2e-portal-${Date.now()}@test.example`;
  await ownerPage.locator('input[type="email"]').fill(uniqueEmail);
  await ownerPage.locator("select").first().selectOption("CLIENT_PORTAL");
  // The client-scope <select> only renders once CLIENT_PORTAL is chosen.
  await ownerPage.locator("select").nth(1).selectOption({ label: "Volt Mobile" });
  await ownerPage.getByRole("button", { name: /send invite/i }).click();

  const inviteLinkCode = ownerPage.locator("code");
  await expect(inviteLinkCode).toBeVisible();
  const inviteLink = (await inviteLinkCode.textContent())!.trim();

  const contactContext = await browser.newContext();
  const contactPage = await contactContext.newPage();
  await contactPage.goto(inviteLink);
  await contactPage.locator('input[type="text"], input:not([type])').first().fill("E2E Portal Contact");
  await contactPage.locator('input[type="password"]').fill("a-real-password-123");
  await contactPage.getByRole("button", { name: /accept invitation/i }).click();

  // Whatever the accept flow's own redirect target, this role must end
  // up on the portal — never the internal dashboard.
  await expect(contactPage).toHaveURL(/\/portal/);
  await expect(contactPage.getByRole("heading", { name: "Volt Mobile" })).toBeVisible();
  await expect(contactPage.getByText("Pending your review")).toBeVisible();

  // The real guarantee: direct navigation to internal-only routes is
  // refused every time, not just skipped once at login.
  await contactPage.goto("/dashboard");
  await expect(contactPage).toHaveURL(/\/portal/);

  await contactPage.goto("/clients");
  await expect(contactPage).toHaveURL(/\/portal/);

  await ownerContext.close();
  await contactContext.close();
});
