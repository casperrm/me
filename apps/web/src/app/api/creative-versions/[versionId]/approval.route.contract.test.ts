// API-contract test for the two halves of the approval workflow
// (Bible Section 15.1): POST .../request-approval and POST .../decide.
// See apps/web/src/app/api/expenses/route.contract.test.ts for the
// pattern this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { createCampaign, createCreative } from "@/lib/services/creative-service";
import { POST as requestApprovalRoute } from "./request-approval/route";
import { POST as decideRoute } from "./decide/route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.notification.deleteMany();
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
let designerUserId: string;
let creativeVersionId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Approval Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "approval-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "approval-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Approval Route Client", companyName: "Inc", services: "[]" },
  });
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Launch" } });
  const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, name: "Launch Campaign" });
  const creative = await createCreative({ actorUserId: ownerUserId, organizationId: orgId, campaignId: campaign.id, type: "image" });
  const version = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id } });
  creativeVersionId = version.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST .../request-approval", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await requestApprovalRoute(request("http://localhost/x", {}), { params: Promise.resolve({ versionId: creativeVersionId }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without clients:write on this client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await requestApprovalRoute(request("http://localhost/x", {}), { params: Promise.resolve({ versionId: creativeVersionId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually transitions the creative to PENDING_APPROVAL", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await requestApprovalRoute(request("http://localhost/x", { comment: "Please review" }), {
      params: Promise.resolve({ versionId: creativeVersionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const version = await prisma.creativeVersion.findUniqueOrThrow({ where: { id: creativeVersionId }, include: { creative: true } });
    expect(version.creative.status).toBe("PENDING_APPROVAL");
  });
});

describe("POST .../decide", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await decideRoute(request("http://localhost/x", { decision: "approved" }), {
      params: Promise.resolve({ versionId: creativeVersionId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when decision is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await decideRoute(request("http://localhost/x", {}), { params: Promise.resolve({ versionId: creativeVersionId }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid decision value, from the real service's own validation", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await decideRoute(request("http://localhost/x", { decision: "yolo" }), { params: Promise.resolve({ versionId: creativeVersionId }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 and actually transitions the creative to APPROVED", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await decideRoute(request("http://localhost/x", { decision: "approved" }), { params: Promise.resolve({ versionId: creativeVersionId }) });
    expect(res.status).toBe(200);

    const version = await prisma.creativeVersion.findUniqueOrThrow({ where: { id: creativeVersionId }, include: { creative: true } });
    expect(version.creative.status).toBe("APPROVED");
  });
});
