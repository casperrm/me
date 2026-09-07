// API-contract test for POST /api/clients/[id]/projects/from-template.
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
let clientId: string;
let templateId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "From Template Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "from-template-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "from-template-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "From Template Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;

  const template = await prisma.projectTemplate.create({
    data: { organizationId: orgId, name: "Standard Launch", tasks: { create: [{ title: "Draft brief", priority: "high", position: 0 }] } },
  });
  templateId = template.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/clients/x/projects/from-template", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/clients/[id]/projects/from-template", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ templateId }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when templateId is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ templateId }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists a real project with real tasks copied from the template", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ templateId, name: "New Launch" }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, projectId: expect.any(String) });

    const stored = await prisma.project.findUnique({ where: { id: body.projectId }, include: { tasks: true } });
    expect(stored).toMatchObject({ clientId, name: "New Launch" });
    expect(stored?.tasks).toMatchObject([{ title: "Draft brief", priority: "high" }]);
  });

  it("returns 400 for a template in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherTemplate = await prisma.projectTemplate.create({ data: { organizationId: otherOrg.id, name: "Other Template" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ templateId: otherTemplate.id }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(400);
  });
});
