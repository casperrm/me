// API-contract test for POST /api/creatives/[creativeId]/video-brief.
// See apps/web/src/app/api/expenses/route.contract.test.ts for the
// pattern this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.qualityCheckResult.deleteMany();
  await prisma.videoBriefVersion.deleteMany();
  await prisma.videoBrief.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.shoot.deleteMany();
  await prisma.task.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.clientHealthScore.deleteMany();
  await prisma.note.deleteMany();
  await prisma.project.deleteMany();
  await prisma.brandProfileVersion.deleteMany();
  await prisma.brandProfile.deleteMany();
  await prisma.connectionEvent.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let creativeId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Video Brief Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "video-brief-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "video-brief-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Video Brief Client", companyName: "Inc", services: "[]" } });
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Video Brief Project" } });
  const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "Video Brief Campaign" } });
  const creative = await prisma.creative.create({ data: { campaignId: campaign.id, type: "video", currentVersion: 1 } });
  await prisma.creativeVersion.create({ data: { creativeId: creative.id, version: 1 } });
  creativeId = creative.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/creatives/x/video-brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/creatives/[creativeId]/video-brief", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ concept: "x" }), { params: Promise.resolve({ creativeId }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ concept: "x" }), { params: Promise.resolve({ creativeId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists the real brief fields", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(
      request({ concept: "Product launch", hook: "Ever wondered...", script: "Full script here", platformVariants: ["9:16", "1:1"] }),
      { params: Promise.resolve({ creativeId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, version: expect.any(Number) });

    const stored = await prisma.videoBriefVersion.findFirst({ where: { videoBrief: { creativeId } } });
    expect(stored).toMatchObject({ concept: "Product launch", hook: "Ever wondered...", script: "Full script here" });
  });

  it("returns 400 for a creative in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherCampaign = await prisma.campaign.create({ data: { projectId: otherProject.id, name: "Other Campaign" } });
    const otherCreative = await prisma.creative.create({ data: { campaignId: otherCampaign.id, type: "video", currentVersion: 1 } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ concept: "x" }), { params: Promise.resolve({ creativeId: otherCreative.id }) });
    expect(res.status).toBe(400);
  });
});
