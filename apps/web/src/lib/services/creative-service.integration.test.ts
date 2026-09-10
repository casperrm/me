// Integration test for the Campaign -> Creative -> CreativeVersion ->
// Approval lifecycle (Bible Section 15.1). See identity.integration.test.ts
// for why next/headers and server-only are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import {
  addCreativeVersion,
  createCampaign,
  createCreative,
  recordApprovalDecision,
  requestApproval,
} from "./creative-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.qualityCheckResult.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Creative Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "creative-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Creative Client", companyName: "Creative Co", services: "[]" },
  });
  clientId = client.id;

  const project = await prisma.project.create({ data: { clientId, name: "Launch" } });
  projectId = project.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("full campaign -> creative -> approval lifecycle", () => {
  it("creates a campaign and a creative with version 1 already present", async () => {
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "FastCharge Launch" });
    const creative = await createCreative({
      actorUserId: ownerUserId,
      organizationId: orgId,
      campaignId: campaign.id,
      type: "image",
      platform: "instagram_feed",
      notes: "first draft",
    });

    expect(creative.status).toBe("DRAFT");
    expect(creative.currentVersion).toBe(1);

    const versions = await prisma.creativeVersion.findMany({ where: { creativeId: creative.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0].notes).toBe("first draft");
  });

  it("rejects a campaign for a project in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Creative Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "Other Co", services: "[]" },
    });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });

    await expect(
      createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId: otherProject.id, name: "Nope" }),
    ).rejects.toThrow(AuthError);
  });

  it("moves through requested -> changes_requested -> new version -> approved", async () => {
    const creative = await prisma.creative.findFirstOrThrow({ where: { campaign: { projectId } } });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });
    const initialUpdatedAt = creative.updatedAt.getTime();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id, comment: "please review" });

    let updated = await prisma.creative.findUniqueOrThrow({ where: { id: creative.id } });
    expect(updated.status).toBe("PENDING_APPROVAL");
    // Section 27.1: a real status transition bumps updatedAt, not just createdAt.
    expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);

    await recordApprovalDecision({
      actorUserId: ownerUserId,
      actorName: "Owner",
      organizationId: orgId,
      creativeVersionId: v1.id,
      decision: "changes_requested",
      comment: "make it bolder",
      decidedBy: "Client Contact",
    });

    updated = await prisma.creative.findUniqueOrThrow({ where: { id: creative.id } });
    expect(updated.status).toBe("DRAFT");

    const v2 = await addCreativeVersion({ actorUserId: ownerUserId, organizationId: orgId, creativeId: creative.id, notes: "bolder colors" });
    expect(v2.version).toBe(2);

    updated = await prisma.creative.findUniqueOrThrow({ where: { id: creative.id } });
    expect(updated.currentVersion).toBe(2);
    expect(updated.status).toBe("DRAFT");

    await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v2.id });
    await recordApprovalDecision({
      actorUserId: ownerUserId,
      actorName: "Owner",
      organizationId: orgId,
      creativeVersionId: v2.id,
      decision: "approved",
      decidedBy: "Client Contact",
    });

    updated = await prisma.creative.findUniqueOrThrow({ where: { id: creative.id } });
    expect(updated.status).toBe("APPROVED");

    const approvals = await prisma.approval.findMany({ where: { creativeVersion: { creativeId: creative.id } }, orderBy: { createdAt: "asc" } });
    expect(approvals.map((a) => a.decision)).toEqual(["requested", "changes_requested", "requested", "approved"]);

    const timelineApproved = await prisma.clientTimelineEvent.findFirst({ where: { clientId, type: "creative_approved" } });
    expect(timelineApproved).toBeTruthy();
  });

  it("tags each approval audit event with the exact Approval row it documents", async () => {
    // Approval is itself an append-only log — every requestApproval/
    // recordApprovalDecision call creates its own new row (decision:
    // "requested"/"changes_requested"/"approved"/...), never updates one
    // in place. So approvalId isn't a shared "round" grouping key; it's a
    // precise 1:1 pointer from one audit event to the exact Approval row
    // it documents — useful because resourceId alone (the
    // creativeVersionId) is identical across every round on the same
    // version, so it can't tell two different Approval rows apart without
    // guessing from timestamp order.
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "Approval Pairing Test" });
    const creative = await createCreative({
      actorUserId: ownerUserId,
      organizationId: orgId,
      campaignId: campaign.id,
      type: "image",
      platform: "instagram_feed",
    });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    const requestedRound1 = await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id });
    const decidedRound1 = await recordApprovalDecision({
      actorUserId: ownerUserId,
      actorName: "Owner",
      organizationId: orgId,
      creativeVersionId: v1.id,
      decision: "changes_requested",
    });

    // Same CreativeVersion, a second full round of request -> decide —
    // same resourceId as round 1's events, but distinct Approval rows.
    const requestedRound2 = await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id });
    const decidedRound2 = await recordApprovalDecision({
      actorUserId: ownerUserId,
      actorName: "Owner",
      organizationId: orgId,
      creativeVersionId: v1.id,
      decision: "approved",
    });

    const approvalIds = [requestedRound1.id, decidedRound1.id, requestedRound2.id, decidedRound2.id];
    expect(new Set(approvalIds).size).toBe(4); // all four are genuinely distinct rows

    for (const approval of [requestedRound1, decidedRound1, requestedRound2, decidedRound2]) {
      const event = await prisma.auditEvent.findFirstOrThrow({ where: { approvalId: approval.id } });
      expect(event.resourceId).toBe(v1.id);
      expect(event.action).toBe(approval.decision === "requested" ? "approval.requested" : "approval.decided");
      // The whole point: given only the audit event, the exact Approval
      // row it documents (not just "some approval on this version around
      // this time") is a direct lookup, not a guess.
      const resolved = await prisma.approval.findUniqueOrThrow({ where: { id: event.approvalId! } });
      expect(resolved.decision).toBe(approval.decision);
    }

    // Every "approval.*" event for this CreativeVersion still shows up
    // under the old resourceId-based query too — approvalId is additive.
    const allEventsForVersion = await prisma.auditEvent.findMany({
      where: { resourceType: "CreativeVersion", resourceId: v1.id, action: { startsWith: "approval." } },
    });
    expect(allEventsForVersion).toHaveLength(4);
  });

  it("rejects submitting an old (non-current) version for approval", async () => {
    const creative = await prisma.creative.findFirstOrThrow({ where: { campaign: { projectId } } });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    await expect(
      requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects recording a decision when there is no pending approval", async () => {
    const creative = await prisma.creative.findFirstOrThrow({ where: { campaign: { projectId } } });
    const v2 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 2 } });

    // Already approved by the previous test — no pending request left.
    await expect(
      recordApprovalDecision({ actorUserId: ownerUserId, actorName: "Owner", organizationId: orgId, creativeVersionId: v2.id, decision: "approved" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects approval actions from a member with no clients:write on this client", async () => {
    const designer = await prisma.user.create({
      data: { email: "creative-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: orgId, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

    const campaign = await prisma.campaign.findFirstOrThrow({ where: { projectId } });

    await expect(
      createCreative({ actorUserId: designer.id, organizationId: orgId, campaignId: campaign.id, type: "video" }),
    ).rejects.toThrow();
  });
});
