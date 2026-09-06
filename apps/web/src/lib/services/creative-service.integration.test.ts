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

    await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id, comment: "please review" });

    let updated = await prisma.creative.findUniqueOrThrow({ where: { id: creative.id } });
    expect(updated.status).toBe("PENDING_APPROVAL");

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
