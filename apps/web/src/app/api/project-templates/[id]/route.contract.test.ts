// API-contract test for PATCH/DELETE /api/project-templates/[id]. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows; wipeDatabase's FK-safe order is copied from
// apps/web/src/app/api/milestones/[id]/route.contract.test.ts (the most
// recently extended sibling in this suite) rather than rederived, since
// the shared cedarpoint_test database is not reset between test files.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { DELETE, PATCH } from "./route";

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
  const org = await prisma.organization.create({ data: { name: "Project Template Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "pt-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "pt-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

async function makeTemplate(name: string, taskCount = 0) {
  return prisma.projectTemplate.create({
    data: {
      organizationId: orgId,
      name,
      tasks: { create: Array.from({ length: taskCount }, (_, i) => ({ title: `Task ${i}`, position: i })) },
    },
    include: { tasks: true },
  });
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/project-templates/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/project-templates/x", { method: "DELETE" });
}

describe("PATCH /api/project-templates/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    const template = await makeTemplate("Auth Check Template");
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await PATCH(patchRequest({ name: "New Name" }), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const template = await makeTemplate("Missing Name Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({}), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without org-wide clients:write", async () => {
    const template = await makeTemplate("Forbidden Rename Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({ name: "Nope" }), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists the new name", async () => {
    const template = await makeTemplate("Old Name");
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({ name: "New Name" }), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, templateId: template.id, name: "New Name" });
    expect((await prisma.projectTemplate.findUnique({ where: { id: template.id } }))?.name).toBe("New Name");
  });

  it("returns 400 for a template in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherTemplate = await prisma.projectTemplate.create({ data: { organizationId: otherOrg.id, name: "Other Org Template" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({ name: "Hijacked" }), { params: Promise.resolve({ id: otherTemplate.id }) });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/project-templates/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    const template = await makeTemplate("Delete Auth Check");
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without org-wide clients:write", async () => {
    const template = await makeTemplate("Forbidden Delete Template");
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually removes the template and its task rows", async () => {
    const template = await makeTemplate("Real Delete Template", 2);
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(200);
    expect(await prisma.projectTemplate.findUnique({ where: { id: template.id } })).toBeNull();
    expect(await prisma.projectTemplateTask.findMany({ where: { templateId: template.id } })).toHaveLength(0);
  });

  it("returns 400 for a template in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Delete Org" } });
    const otherTemplate = await prisma.projectTemplate.create({ data: { organizationId: otherOrg.id, name: "Other Org Delete Template" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: otherTemplate.id }) });
    expect(res.status).toBe(400);
  });
});
