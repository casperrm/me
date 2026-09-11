// Covers the thin wrapping added on top of membership-service's
// canManageMembership gate (already covered at the service layer by
// identity.integration.test.ts's "last-owner protection" suite): an
// ADMIN acting on a non-last OWNER is a real, reachable case the Team
// page's UI doesn't hide (it only hides the form for the *last remaining*
// OWNER), so changeRoleAction/revokeMembershipAction must return {error}
// instead of throwing — see docs/specs/error-boundaries.md's named
// follow-up.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@cedar/db";
import { changeRoleAction, revokeMembershipAction } from "./membership";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let adminUserId: string;
let coOwnerMembershipId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Membership Action Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "member-action-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const coOwner = await prisma.user.create({ data: { email: "member-action-coowner@test.example", name: "Co-Owner", passwordHash: "irrelevant" } });
  const coOwnerMembership = await prisma.membership.create({ data: { organizationId: org.id, userId: coOwner.id, role: "OWNER", status: "ACTIVE" } });
  coOwnerMembershipId = coOwnerMembership.id;

  const admin = await prisma.user.create({ data: { email: "member-action-admin@test.example", name: "Admin", passwordHash: "irrelevant" } });
  await prisma.membership.create({ data: { organizationId: org.id, userId: admin.id, role: "ADMIN", status: "ACTIVE" } });
  adminUserId = admin.id;

  getCurrentActor.mockResolvedValue({ user: { id: adminUserId }, organizationId: orgId });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("changeRoleAction", () => {
  it("returns {error} instead of throwing when an ADMIN targets a non-last OWNER (only an OWNER may)", async () => {
    const formData = new FormData();
    formData.set("membershipId", coOwnerMembershipId);
    formData.set("role", "ACCOUNT_MANAGER");

    const result = await changeRoleAction(formData);

    expect(result?.error).toBeTruthy();
    const stillOwner = await prisma.membership.findUniqueOrThrow({ where: { id: coOwnerMembershipId } });
    expect(stillOwner.role).toBe("OWNER");
  });
});

describe("revokeMembershipAction", () => {
  it("returns {error} instead of throwing when an ADMIN targets a non-last OWNER", async () => {
    const formData = new FormData();
    formData.set("membershipId", coOwnerMembershipId);

    const result = await revokeMembershipAction(formData);

    expect(result?.error).toBeTruthy();
    const stillActive = await prisma.membership.findUniqueOrThrow({ where: { id: coOwnerMembershipId } });
    expect(stillActive.status).toBe("ACTIVE");
  });
});

// Real, reachable race (docs/specs/mfa.md's own named gap): an owner
// toggles the organization's MFA-required policy on while a privileged
// user still has a page open from before that change — their next write
// throws MfaRequiredError at the service layer (requirePermission),
// which changeRoleAction/revokeMembershipAction/grantClientScopeAction
// none caught before this slice.
describe("MFA enforcement gate", () => {
  it("returns {error} instead of throwing when the acting ADMIN hasn't enrolled and the org now requires it", async () => {
    const mfaOrg = await prisma.organization.create({ data: { name: "Membership MFA Gate Agency", mfaRequiredForPrivilegedRoles: true } });
    const unenrolledAdmin = await prisma.user.create({
      data: { email: "membership-mfa-gate-admin@test.example", name: "Unenrolled Admin", passwordHash: "irrelevant", mfaEnabled: false },
    });
    const adminMembership = await prisma.membership.create({
      data: { organizationId: mfaOrg.id, userId: unenrolledAdmin.id, role: "ADMIN", status: "ACTIVE" },
    });
    const target = await prisma.user.create({
      data: { email: "membership-mfa-gate-target@test.example", name: "Target", passwordHash: "irrelevant" },
    });
    const targetMembership = await prisma.membership.create({
      data: { organizationId: mfaOrg.id, userId: target.id, role: "DESIGNER", status: "ACTIVE" },
    });

    getCurrentActor.mockResolvedValueOnce({ user: { id: unenrolledAdmin.id }, organizationId: mfaOrg.id });

    const formData = new FormData();
    formData.set("membershipId", targetMembership.id);
    formData.set("role", "ACCOUNT_MANAGER");
    formData.set("expectedVersion", "0");

    const result = await changeRoleAction(formData);

    expect(result?.error).toBe("MFA enrollment is required for this account before this action can be performed.");

    getCurrentActor.mockResolvedValue({ user: { id: adminUserId }, organizationId: orgId });
    await prisma.membership.deleteMany({ where: { id: { in: [adminMembership.id, targetMembership.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [unenrolledAdmin.id, target.id] } } });
    await prisma.organization.deleteMany({ where: { id: mfaOrg.id } });
  });
});
