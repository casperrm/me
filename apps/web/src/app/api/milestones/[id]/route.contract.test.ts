// API-contract test for DELETE /api/milestones/[id]. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { DELETE } from "./route";

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
  await prisma.taskComment.deleteMany();
  await prisma.taskChecklistItem.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.task.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.campaign.deleteMany();
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
let projectId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Milestone Delete Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "milestone-delete-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "milestone-delete-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Milestone Delete Client", companyName: "Inc", services: "[]" } });
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Milestone Delete Project" } });
  projectId = project.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request() {
  return new Request("http://localhost/api/milestones/x", { method: "DELETE" });
}

describe("DELETE /api/milestones/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    const milestone = await prisma.milestone.create({ data: { projectId, name: "M1", dueDate: new Date("2030-01-15") } });
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await DELETE(request(), { params: Promise.resolve({ id: milestone.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without clients:write", async () => {
    const milestone = await prisma.milestone.create({ data: { projectId, name: "M2", dueDate: new Date("2030-01-15") } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: milestone.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually removes the milestone", async () => {
    const milestone = await prisma.milestone.create({ data: { projectId, name: "M3", dueDate: new Date("2030-01-15") } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: milestone.id }) });
    expect(res.status).toBe(200);
    expect(await prisma.milestone.findUnique({ where: { id: milestone.id } })).toBeNull();
  });

  it("returns 400 for a milestone in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherMilestone = await prisma.milestone.create({ data: { projectId: otherProject.id, name: "Other Milestone", dueDate: new Date("2030-01-15") } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: otherMilestone.id }) });
    expect(res.status).toBe(400);
  });
});
