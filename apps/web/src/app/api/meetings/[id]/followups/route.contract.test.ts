// API-contract test for POST /api/meetings/[id]/followups. See
// apps/web/src/app/api/meetings/route.contract.test.ts for the wipeDatabase
// order this follows (shared cedarpoint_test database, not reset between
// test files).
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
let designerMembershipId: string;
let meetingId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Meeting FollowUps Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "meeting-followups-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "meeting-followups-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  const designerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" },
  });
  designerMembershipId = designerMembership.id;

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "FollowUps Client", companyName: "Inc", services: "[]" } });
  const meeting = await prisma.meeting.create({ data: { organizationId: org.id, clientId: client.id, title: "FollowUps Meeting" } });
  meetingId = meeting.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/meetings/x/followups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/meetings/[id]/followups", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ text: "Send proposal" }), { params: Promise.resolve({ id: meetingId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when text is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}), { params: Promise.resolve({ id: meetingId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write on this meeting's client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ text: "Nope" }), { params: Promise.resolve({ id: meetingId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists a real follow-up with owner and due date", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(
      request({ text: "Send updated proposal", ownerMembershipId: designerMembershipId, dueDate: "2026-10-01T00:00:00.000Z" }),
      { params: Promise.resolve({ id: meetingId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, followUpId: expect.any(String) });

    const stored = await prisma.meeting.findUnique({ where: { id: meetingId } });
    const followUps = JSON.parse(stored!.followUps!);
    expect(followUps).toEqual([
      expect.objectContaining({
        id: body.followUpId,
        text: "Send updated proposal",
        ownerMembershipId: designerMembershipId,
        dueDate: "2026-10-01T00:00:00.000Z",
        promotedTaskId: null,
      }),
    ]);
  });

  it("returns 400 for a meeting in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Meeting FollowUps Other Org" } });
    const otherMeeting = await prisma.meeting.create({ data: { organizationId: otherOrg.id, title: "Other Org Meeting" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ text: "Hijack" }), { params: Promise.resolve({ id: otherMeeting.id }) });
    expect(res.status).toBe(400);
  });
});
