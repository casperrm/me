// Integration test for the Client Portal flow (Bible Section 15.2):
// invite a CLIENT_PORTAL contact pre-scoped to one client, accept the
// invite, confirm the portal ScopedGrants are auto-created, and confirm
// the portal contact can decide an approval for their own client but has
// no access whatsoever to any other client or to any org-wide permission.
// See identity.integration.test.ts for why next/headers and server-only
// are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { isAuthorized } from "@cedar/auth";
import { AuthError } from "./auth-service";
import { acceptInvitationFlow, createInvitation } from "./membership-service";
import { createCampaign, createCreative, recordApprovalDecision, requestApproval } from "./creative-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientAId: string;
let clientBId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Portal Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "portal-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { organizationId: org.id, name: "Portal Client A", companyName: "A Inc", services: "[]" } }),
    prisma.client.create({ data: { organizationId: org.id, name: "Portal Client B", companyName: "B Inc", services: "[]" } }),
  ]);
  clientAId = clientA.id;
  clientBId = clientB.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("Client Portal invitation", () => {
  it("refuses a CLIENT_PORTAL invite with no client specified", async () => {
    await expect(
      createInvitation({ actorUserId: ownerUserId, organizationId: orgId, email: "noclient@test.example", role: "CLIENT_PORTAL" }),
    ).rejects.toThrow(AuthError);
  });

  it("invites, accepts, and auto-grants exactly the portal scope for that one client", async () => {
    const token = await createInvitation({
      actorUserId: ownerUserId,
      organizationId: orgId,
      email: "portal-contact@test.example",
      role: "CLIENT_PORTAL",
      clientId: clientAId,
    });

    await acceptInvitationFlow(token, { name: "Portal Contact", password: "a-good-password-123" });

    const portalUser = await prisma.user.findUniqueOrThrow({ where: { email: "portal-contact@test.example" } });
    const portalMembership = await prisma.membership.findFirstOrThrow({ where: { userId: portalUser.id } });
    expect(portalMembership.role).toBe("CLIENT_PORTAL");

    const grants = await prisma.scopedGrant.findMany({ where: { membershipId: portalMembership.id } });
    expect(grants).toHaveLength(2);
    expect(grants.every((g) => g.clientId === clientAId)).toBe(true);
    expect(grants.map((g) => g.permission).sort()).toEqual(["approvals:decide", "clients:read"]);
  });

  it("scopes the new portal contact to exactly Client A — nothing else", async () => {
    const portalUser = await prisma.user.findUniqueOrThrow({ where: { email: "portal-contact@test.example" } });

    expect(await isAuthorized({ userId: portalUser.id, organizationId: orgId, permission: "clients:read", clientId: clientAId })).toBe(true);
    expect(await isAuthorized({ userId: portalUser.id, organizationId: orgId, permission: "clients:read", clientId: clientBId })).toBe(false);
    expect(await isAuthorized({ userId: portalUser.id, organizationId: orgId, permission: "clients:write", clientId: clientAId })).toBe(false);
    expect(await isAuthorized({ userId: portalUser.id, organizationId: orgId, permission: "finance:read" })).toBe(false);
    expect(await isAuthorized({ userId: portalUser.id, organizationId: orgId, permission: "members:invite" })).toBe(false);
  });
});

describe("Client Portal decides an approval", () => {
  it("lets the portal contact record a decision, always attributed to their own identity", async () => {
    const portalUser = await prisma.user.findUniqueOrThrow({ where: { email: "portal-contact@test.example" } });

    const project = await prisma.project.create({ data: { clientId: clientAId, name: "Portal Launch" } });
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, name: "Portal Campaign" });
    const creative = await createCreative({ actorUserId: ownerUserId, organizationId: orgId, campaignId: campaign.id, type: "image" });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id });

    // The portal contact submits someone else's name as decidedBy — the
    // server must ignore it and attribute the decision to their own
    // authenticated name instead (the security invariant this whole
    // feature exists to enforce).
    await recordApprovalDecision({
      actorUserId: portalUser.id,
      actorName: "Portal Contact",
      organizationId: orgId,
      creativeVersionId: v1.id,
      decision: "approved",
      decidedBy: "Someone Else Entirely",
    });

    const updated = await prisma.creative.findUniqueOrThrow({ where: { id: creative.id } });
    expect(updated.status).toBe("APPROVED");

    const approval = await prisma.approval.findFirstOrThrow({ where: { creativeVersionId: v1.id, decision: "approved" } });
    expect(approval.decidedBy).toBe("Portal Contact");
  });

  it("refuses the same portal contact acting on a different client's creative", async () => {
    const portalUser = await prisma.user.findUniqueOrThrow({ where: { email: "portal-contact@test.example" } });

    const project = await prisma.project.create({ data: { clientId: clientBId, name: "Other Client Launch" } });
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, name: "Other Campaign" });
    const creative = await createCreative({ actorUserId: ownerUserId, organizationId: orgId, campaignId: campaign.id, type: "image" });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });
    await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id });

    await expect(
      recordApprovalDecision({
        actorUserId: portalUser.id,
        actorName: "Portal Contact",
        organizationId: orgId,
        creativeVersionId: v1.id,
        decision: "approved",
      }),
    ).rejects.toThrow();
  });
});
