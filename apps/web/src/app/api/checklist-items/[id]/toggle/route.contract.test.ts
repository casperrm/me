// API-contract test for POST /api/checklist-items/[id]/toggle. See
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
  await prisma.taskChecklistItem.deleteMany();
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
let itemId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Checklist Toggle Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "checklist-toggle-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "checklist-toggle-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Checklist Toggle Client", companyName: "Inc", services: "[]" } });
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Checklist Toggle Project" } });
  const task = await prisma.task.create({ data: { projectId: project.id, title: "Checklist Toggle Task" } });
  const item = await prisma.taskChecklistItem.create({ data: { taskId: task.id, text: "Toggle me", position: 0 } });
  itemId = item.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request() {
  return new Request("http://localhost/api/checklist-items/x/toggle", { method: "POST" });
}

describe("POST /api/checklist-items/[id]/toggle", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request(), { params: Promise.resolve({ id: itemId }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: itemId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually flips done, then flips it back on a second call", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const first = await POST(request(), { params: Promise.resolve({ id: itemId }) });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toEqual({ ok: true, done: true });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const second = await POST(request(), { params: Promise.resolve({ id: itemId }) });
    const secondBody = await second.json();
    expect(secondBody).toEqual({ ok: true, done: false });

    const stored = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
    expect(stored?.done).toBe(false);
  });

  it("returns 400 for a checklist item from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherTask = await prisma.task.create({ data: { projectId: otherProject.id, title: "Other Task" } });
    const otherItem = await prisma.taskChecklistItem.create({ data: { taskId: otherTask.id, text: "Other item", position: 0 } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: otherItem.id }) });
    expect(res.status).toBe(400);
  });
});
