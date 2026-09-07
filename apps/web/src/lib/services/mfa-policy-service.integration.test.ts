// Integration test for mfa-policy-service.ts — the Section 23.1
// enforcement gate docs/specs/mfa.md's original scope boundary named as
// not yet built. See identity.integration.test.ts for why next/headers
// and server-only are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthorizationError } from "@cedar/auth";
import { AuthError } from "./auth-service";
import { getMfaPolicy, isMfaEnrollmentRequired, setMfaRequiredForPrivilegedRoles } from "./mfa-policy-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let adminUserId: string;
let designerUserId: string;
let otherOrgId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "MFA Policy Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "mfa-policy-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const admin = await prisma.user.create({
    data: { email: "mfa-policy-admin@test.example", name: "Admin", passwordHash: "irrelevant" },
  });
  adminUserId = admin.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: admin.id, role: "ADMIN", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "mfa-policy-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const otherOrg = await prisma.organization.create({ data: { name: "MFA Policy Other Org" } });
  otherOrgId = otherOrg.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("getMfaPolicy", () => {
  it("defaults to not required — no existing organization is silently locked out", async () => {
    const policy = await getMfaPolicy(orgId);
    expect(policy.requiredForPrivilegedRoles).toBe(false);
  });
});

describe("setMfaRequiredForPrivilegedRoles", () => {
  it("throws AuthorizationError for a member without organization:manage", async () => {
    await expect(
      setMfaRequiredForPrivilegedRoles({ actorUserId: designerUserId, organizationId: orgId, required: true }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("throws AuthError when required is not a boolean", async () => {
    await expect(
      // @ts-expect-error deliberately wrong type for the runtime check
      setMfaRequiredForPrivilegedRoles({ actorUserId: ownerUserId, organizationId: orgId, required: "yes" }),
    ).rejects.toThrow(AuthError);
  });

  it("turns the policy on for an owner, persists it, and records a real audit event", async () => {
    const policy = await setMfaRequiredForPrivilegedRoles({ actorUserId: ownerUserId, organizationId: orgId, required: true });
    expect(policy.requiredForPrivilegedRoles).toBe(true);

    const persisted = await getMfaPolicy(orgId);
    expect(persisted.requiredForPrivilegedRoles).toBe(true);

    const audit = await prisma.auditEvent.findFirst({ where: { organizationId: orgId, action: "mfa_policy.updated" } });
    expect(audit).toBeTruthy();
    expect(audit?.resourceId).toBe(orgId);
  });

  it("does not affect a different organization's policy", async () => {
    const otherPolicy = await getMfaPolicy(otherOrgId);
    expect(otherPolicy.requiredForPrivilegedRoles).toBe(false);
  });

  it("an admin (who also holds organization:manage) can turn it back off", async () => {
    const policy = await setMfaRequiredForPrivilegedRoles({ actorUserId: adminUserId, organizationId: orgId, required: false });
    expect(policy.requiredForPrivilegedRoles).toBe(false);
  });
});

describe("isMfaEnrollmentRequired", () => {
  it("is false for anyone when the org policy is off", async () => {
    await setMfaRequiredForPrivilegedRoles({ actorUserId: ownerUserId, organizationId: orgId, required: false });

    const required = await isMfaEnrollmentRequired({
      organizationId: orgId,
      membership: { role: "OWNER" },
      user: { mfaEnabled: false },
    });
    expect(required).toBe(false);
  });

  it("is true for an unenrolled OWNER once the org turns the policy on", async () => {
    await setMfaRequiredForPrivilegedRoles({ actorUserId: ownerUserId, organizationId: orgId, required: true });

    const required = await isMfaEnrollmentRequired({
      organizationId: orgId,
      membership: { role: "OWNER" },
      user: { mfaEnabled: false },
    });
    expect(required).toBe(true);
  });

  it("is true for an unenrolled ADMIN too", async () => {
    const required = await isMfaEnrollmentRequired({
      organizationId: orgId,
      membership: { role: "ADMIN" },
      user: { mfaEnabled: false },
    });
    expect(required).toBe(true);
  });

  it("is false once the user has actually enrolled, even with the policy on", async () => {
    const required = await isMfaEnrollmentRequired({
      organizationId: orgId,
      membership: { role: "OWNER" },
      user: { mfaEnabled: true },
    });
    expect(required).toBe(false);
  });

  it("is false for a non-privileged role regardless of the policy", async () => {
    const required = await isMfaEnrollmentRequired({
      organizationId: orgId,
      membership: { role: "DESIGNER" },
      user: { mfaEnabled: false },
    });
    expect(required).toBe(false);
  });
});
