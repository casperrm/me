// API-contract test for POST /api/project-templates/[id]/tasks. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows; wipeDatabase's FK-safe order is copied from
// apps/web/src/app/api/milestones/[id]/route.contract.test.ts.
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
  const org = await prisma.organization.create({ data: { name: "Template Add Task Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "tt-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "tt-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

async function makeTemplate(name: string) {
  return prisma.projectTemplate.create({ data: { organizationId: orgId, name } });
}

function request(body: unknown) {
  return new Request("http://localhost/api/project-templates/x/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/project-templates/[id]/tasks", () => {
  it("returns 401 when no one is signed in", async () => {
    const template = await makeTemplate("Auth Check Template");
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ title: "New task" }), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    const template = await makeTemplate("Missing Title Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without org-wide clients:write", async () => {
    const template = await makeTemplate("Forbidden Add Task Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Nope" }), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 with a real persisted task at the correct next position", async () => {
    const template = await prisma.projectTemplate.create({
      data: { organizationId: orgId, name: "Position Check Template", tasks: { create: [{ title: "Existing", position: 0 }] } },
    });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Second task", priority: "high" }), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.position).toBe(1);

    const row = await prisma.projectTemplateTask.findUnique({ where: { id: body.taskId } });
    expect(row).toMatchObject({ title: "Second task", priority: "high", position: 1 });
  });

  it("returns 400 for an invalid priority", async () => {
    const template = await makeTemplate("Invalid Priority Route Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Bad priority", priority: "urgent" }), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a template in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Add Task Org" } });
    const otherTemplate = await prisma.projectTemplate.create({ data: { organizationId: otherOrg.id, name: "Other Org Template" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Nope" }), { params: Promise.resolve({ id: otherTemplate.id }) });
    expect(res.status).toBe(400);
  });
});
