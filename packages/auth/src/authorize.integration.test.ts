// Integration test for the MFA-enforcement gate added to
// requirePermission/requireAnyPermission — the real security boundary
// half of Section 23.1's org-wide MFA policy
// (Organization.mfaRequiredForPrivilegedRoles). See docs/specs/mfa.md
// for why this lives here (packages/auth's authorization choke point)
// and not only in AppLayout's page-navigation redirect.
//
// Real Postgres (cedarpoint_test, see vitest.config.ts) — no mocking of
// Prisma, matching this codebase's established integration-test
// convention (e.g. apps/web/src/lib/services/mfa-policy-service.integration.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { AuthorizationError, MfaRequiredError, requireAnyPermission, requirePermission } from "./authorize";

async function wipeDatabase() {
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let gatedOrgId: string; // policy on
let ownerUserId: string;
let enrolledOwnerUserId: string;
let adminUserId: string;
let financeUserId: string;
let revokedOwnerUserId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Authorize MFA Gate Test Agency", mfaRequiredForPrivilegedRoles: false } });
  orgId = org.id;

  const gatedOrg = await prisma.organization.create({ data: { name: "Authorize MFA Gate Test Agency (gated)", mfaRequiredForPrivilegedRoles: true } });
  gatedOrgId = gatedOrg.id;

  const owner = await prisma.user.create({
    data: { email: "authorize-gate-owner@test.example", name: "Owner", passwordHash: "irrelevant", mfaEnabled: false },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: gatedOrgId, userId: owner.id, role: "OWNER", status: "ACTIVE" } });
  // Same user also belongs to the non-gated org, to prove the policy is
  // read per-organization, not cached globally on the user.
  await prisma.membership.create({ data: { organizationId: orgId, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const enrolledOwner = await prisma.user.create({
    data: { email: "authorize-gate-enrolled-owner@test.example", name: "Enrolled Owner", passwordHash: "irrelevant", mfaEnabled: true },
  });
  enrolledOwnerUserId = enrolledOwner.id;
  await prisma.membership.create({ data: { organizationId: gatedOrgId, userId: enrolledOwner.id, role: "OWNER", status: "ACTIVE" } });

  const admin = await prisma.user.create({
    data: { email: "authorize-gate-admin@test.example", name: "Admin", passwordHash: "irrelevant", mfaEnabled: false },
  });
  adminUserId = admin.id;
  await prisma.membership.create({ data: { organizationId: gatedOrgId, userId: admin.id, role: "ADMIN", status: "ACTIVE" } });

  const finance = await prisma.user.create({
    data: { email: "authorize-gate-finance@test.example", name: "Finance", passwordHash: "irrelevant", mfaEnabled: false },
  });
  financeUserId = finance.id;
  await prisma.membership.create({ data: { organizationId: gatedOrgId, userId: finance.id, role: "FINANCE", status: "ACTIVE" } });

  // A privileged (OWNER) membership that is REVOKED — can() denies this
  // before the role/permission check ever runs "OWNER can do anything",
  // so it's a real case where the permission check fails outright for a
  // role that would otherwise be MFA-gated, proving the permission check
  // still wins first (an ADMIN/OWNER in this role catalog otherwise holds
  // every permission by construction, so a REVOKED membership is the real
  // way to exercise "authorization denied regardless of MFA status").
  const revokedOwner = await prisma.user.create({
    data: { email: "authorize-gate-revoked-owner@test.example", name: "Revoked Owner", passwordHash: "irrelevant", mfaEnabled: false },
  });
  revokedOwnerUserId = revokedOwner.id;
  await prisma.membership.create({ data: { organizationId: gatedOrgId, userId: revokedOwner.id, role: "OWNER", status: "REVOKED" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("requirePermission — MFA enforcement gate", () => {
  it("throws MfaRequiredError for an unenrolled OWNER when the org policy is on, even though the permission itself is allowed", async () => {
    await expect(
      requirePermission({ userId: ownerUserId, organizationId: gatedOrgId, permission: "clients:read" }),
    ).rejects.toThrow(MfaRequiredError);
  });

  it("throws MfaRequiredError for an unenrolled ADMIN too", async () => {
    await expect(
      requirePermission({ userId: adminUserId, organizationId: gatedOrgId, permission: "clients:write" }),
    ).rejects.toThrow(MfaRequiredError);
  });

  it("passes for the same OWNER once enrolled (mfaEnabled: true)", async () => {
    const membership = await requirePermission({ userId: enrolledOwnerUserId, organizationId: gatedOrgId, permission: "clients:read" });
    expect(membership.role).toBe("OWNER");
  });

  it("passes for the same OWNER in an organization where the policy is off", async () => {
    const membership = await requirePermission({ userId: ownerUserId, organizationId: orgId, permission: "clients:read" });
    expect(membership.role).toBe("OWNER");
  });

  it("never gates a non-privileged role (FINANCE), regardless of the policy", async () => {
    const membership = await requirePermission({ userId: financeUserId, organizationId: gatedOrgId, permission: "finance:read" });
    expect(membership.role).toBe("FINANCE");
  });

  it("still throws plain AuthorizationError (not MfaRequiredError) when the actor isn't authorized at all — the permission check wins first", async () => {
    let caught: unknown;
    try {
      await requirePermission({ userId: revokedOwnerUserId, organizationId: gatedOrgId, permission: "clients:read" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthorizationError);
    expect(caught).not.toBeInstanceOf(MfaRequiredError);
  });
});

describe("requireAnyPermission — MFA enforcement gate", () => {
  it("throws MfaRequiredError for an unenrolled ADMIN when the org policy is on", async () => {
    await expect(
      requireAnyPermission({ userId: adminUserId, organizationId: gatedOrgId, permissions: ["clients:write", "approvals:decide"] }),
    ).rejects.toThrow(MfaRequiredError);
  });

  it("passes once enrolled", async () => {
    const membership = await requireAnyPermission({
      userId: enrolledOwnerUserId,
      organizationId: gatedOrgId,
      permissions: ["clients:write", "approvals:decide"],
    });
    expect(membership.role).toBe("OWNER");
  });

  it("still throws plain AuthorizationError when unauthorized outright, not MfaRequiredError", async () => {
    await expect(
      requireAnyPermission({ userId: revokedOwnerUserId, organizationId: gatedOrgId, permissions: ["clients:read"] }),
    ).rejects.toThrow(AuthorizationError);
  });
});
