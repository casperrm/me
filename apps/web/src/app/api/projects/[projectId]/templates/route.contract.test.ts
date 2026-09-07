// API-contract test for POST /api/projects/[projectId]/templates. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
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
  await prisma.taskComment.deleteMany();
  await prisma.taskChecklistItem.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.task.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.projectTemplateTask.deleteMany();
  await prisma.projectTemplate.deleteMany();
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
  const org = await prisma.organization.create({ data: { name: "Project Template Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "template-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "template-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Template Route Client", companyName: "Inc", services: "[]" } });
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Template Route Project" } });
  projectId = project.id;
  await prisma.task.create({ data: { projectId: project.id, title: "Draft brief", priority: "high" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/projects/x/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/[projectId]/templates", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ name: "Standard Launch" }), { params: Promise.resolve({ projectId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}), { params: Promise.resolve({ projectId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ name: "Standard Launch" }), { params: Promise.resolve({ projectId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists a real template with its real task snapshot", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ name: "Standard Launch" }), { params: Promise.resolve({ projectId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, templateId: expect.any(String), taskCount: 1 });

    const stored = await prisma.projectTemplate.findUnique({ where: { id: body.templateId }, include: { tasks: true } });
    expect(stored?.name).toBe("Standard Launch");
    expect(stored?.tasks).toMatchObject([{ title: "Draft brief", priority: "high", position: 0 }]);
  });

  it("returns 400 for a project in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ name: "Nope" }), { params: Promise.resolve({ projectId: otherProject.id }) });
    expect(res.status).toBe(400);
  });
});
