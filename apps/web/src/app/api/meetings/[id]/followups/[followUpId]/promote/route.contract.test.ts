// API-contract test for POST /api/meetings/[id]/followups/[followUpId]/promote.
// See apps/web/src/app/api/meetings/route.contract.test.ts for the
// wipeDatabase order this follows (shared cedarpoint_test database, not
// reset between test files).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { randomUUID } from "node:crypto";
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
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
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
let clientId: string;
let otherClientId: string;
let projectId: string;
let otherClientProjectId: string;

async function makeMeetingWithFollowUp() {
  const followUpId = randomUUID();
  const meeting = await prisma.meeting.create({
    data: {
      organizationId: orgId,
      clientId,
      title: "Promote Meeting",
      followUps: JSON.stringify([{ id: followUpId, text: "Build it", ownerMembershipId: null, dueDate: null, promotedTaskId: null }]),
    },
  });
  return { meetingId: meeting.id, followUpId };
}

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Meeting Promote Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "meeting-promote-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "meeting-promote-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Promote Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
  const otherClient = await prisma.client.create({ data: { organizationId: org.id, name: "Other Promote Client", companyName: "Inc", services: "[]" } });
  otherClientId = otherClient.id;

  const project = await prisma.project.create({ data: { clientId, name: "Promote Project" } });
  projectId = project.id;
  const otherClientProject = await prisma.project.create({ data: { clientId: otherClientId, name: "Other Client Project" } });
  otherClientProjectId = otherClientProject.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/meetings/x/followups/y/promote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/meetings/[id]/followups/[followUpId]/promote", () => {
  it("returns 401 when no one is signed in", async () => {
    const { meetingId, followUpId } = await makeMeetingWithFollowUp();
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ projectId }), { params: Promise.resolve({ id: meetingId, followUpId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectId is missing", async () => {
    const { meetingId, followUpId } = await makeMeetingWithFollowUp();
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}), { params: Promise.resolve({ id: meetingId, followUpId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write on this meeting's client", async () => {
    const { meetingId, followUpId } = await makeMeetingWithFollowUp();
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ projectId }), { params: Promise.resolve({ id: meetingId, followUpId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually creates a real Task, setting promotedTaskId", async () => {
    const { meetingId, followUpId } = await makeMeetingWithFollowUp();
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ projectId }), { params: Promise.resolve({ id: meetingId, followUpId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, taskId: expect.any(String) });

    const task = await prisma.task.findUnique({ where: { id: body.taskId } });
    expect(task).toMatchObject({ title: "Build it", projectId });

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    const followUps = JSON.parse(meeting!.followUps!);
    expect(followUps.find((f: { id: string }) => f.id === followUpId).promotedTaskId).toBe(body.taskId);
  });

  it("returns 400 on a second promotion attempt of the same follow-up", async () => {
    const { meetingId, followUpId } = await makeMeetingWithFollowUp();
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    await POST(request({ projectId }), { params: Promise.resolve({ id: meetingId, followUpId }) });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ projectId }), { params: Promise.resolve({ id: meetingId, followUpId }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already been promoted");
  });

  it("returns 400 for a project belonging to a different client than the meeting's own client", async () => {
    const { meetingId, followUpId } = await makeMeetingWithFollowUp();
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ projectId: otherClientProjectId }), { params: Promise.resolve({ id: meetingId, followUpId }) });
    expect(res.status).toBe(400);
  });
});
