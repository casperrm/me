// API-contract test for DELETE /api/project-template-tasks/[id]. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows; wipeDatabase's FK-safe order is copied from
// apps/web/src/app/api/milestones/[id]/route.contract.test.ts.
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
  await prisma.projectTemplateTask.deleteMany();
  await prisma.projectTemplate.deleteMany();
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

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Template Remove Task Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "rtt-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "rtt-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

async function makeTemplateTask(templateName: string) {
  const template = await prisma.projectTemplate.create({
    data: { organizationId: orgId, name: templateName, tasks: { create: [{ title: "Task to remove", position: 0 }] } },
    include: { tasks: true },
  });
  return template.tasks[0];
}

function request() {
  return new Request("http://localhost/api/project-template-tasks/x", { method: "DELETE" });
}

describe("DELETE /api/project-template-tasks/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    const task = await makeTemplateTask("Auth Check Template");
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await DELETE(request(), { params: Promise.resolve({ id: task.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without org-wide clients:write", async () => {
    const task = await makeTemplateTask("Forbidden Remove Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: task.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually removes the task row", async () => {
    const task = await makeTemplateTask("Real Remove Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: task.id }) });
    expect(res.status).toBe(200);
    expect(await prisma.projectTemplateTask.findUnique({ where: { id: task.id } })).toBeNull();
  });

  it("returns 400 for a template task in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Remove Task Org" } });
    const otherTemplate = await prisma.projectTemplate.create({
      data: { organizationId: otherOrg.id, name: "Other Org Template", tasks: { create: [{ title: "Other task", position: 0 }] } },
      include: { tasks: true },
    });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: otherTemplate.tasks[0].id }) });
    expect(res.status).toBe(400);
  });
});
