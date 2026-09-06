import { test, expect } from "@playwright/test";

// Bible Section 32/35's second critical E2E flow: invite -> accept ->
// session, run end-to-end through the real UI (no email provider exists
// yet — see InviteForm.tsx — so the invite link is read directly off the
// page, exactly as a real inviter would copy/paste it).
const OWNER_EMAIL = "consultingcedarpoint@gmail.com";
const OWNER_PASSWORD = "cedar-point-dev-only";

test("invite a new member, accept via the link, and land in a real RBAC-scoped session", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();

  await ownerPage.goto("/login");
  await ownerPage.locator('input[type="email"]').fill(OWNER_EMAIL);
  await ownerPage.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await ownerPage.getByRole("button", { name: /log in/i }).click();
  await expect(ownerPage).toHaveURL(/\/dashboard/);

  await ownerPage.goto("/team");
  const uniqueEmail = `e2e-invite-${Date.now()}@test.example`;
  await ownerPage.locator('input[type="email"]').fill(uniqueEmail);
  await ownerPage.locator("select").first().selectOption("ACCOUNT_MANAGER");
  await ownerPage.getByRole("button", { name: /send invite/i }).click();

  const inviteLinkCode = ownerPage.locator("code");
  await expect(inviteLinkCode).toBeVisible();
  const inviteLink = await inviteLinkCode.textContent();
  expect(inviteLink).toMatch(/^\/invite\//);

  // A brand-new browser context — the new member has never had a session,
  // exactly like a real invitee opening the link for the first time.
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();

  await inviteePage.goto(inviteLink!.trim());
  await expect(inviteePage.getByText(uniqueEmail)).toBeVisible();
  await expect(inviteePage.getByText("ACCOUNT_MANAGER")).toBeVisible();

  await inviteePage.locator('input[type="text"], input:not([type])').first().fill("E2E Invitee");
  await inviteePage.locator('input[type="password"]').fill("a-real-password-123");
  await inviteePage.getByRole("button", { name: /accept invitation/i }).click();

  await expect(inviteePage).toHaveURL(/\/dashboard/);

  // ACCOUNT_MANAGER holds no org-wide finance:read by default (see
  // packages/domain/src/roles.ts) — the CEO Dashboard's own real
  // permission check should refuse them, proving this is a genuine
  // RBAC-scoped session for the newly created member, not merely "some
  // page loaded."
  await expect(inviteePage.getByText(/CEO Dashboard shows organization-wide financials/i)).toBeVisible();

  await ownerContext.close();
  await inviteeContext.close();
});
