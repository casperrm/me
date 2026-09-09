// API-contract test for POST /api/meetings. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows; wipeDatabase's FK-safe order is copied from
// apps/web/src/app/api/project-templates/[id]/route.contract.test.ts (the
// most recently extended sibling in this suite) with meetingAttendee/
// meeting inserted alongside the other resource tables, rather than
// rederived, since the shared cedarpoint_test database is not reset
// between test files.
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
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Meetings Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "meetings-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "meetings-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  const designerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" },
  });
  designerMembershipId = designerMembership.id;

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Meetings Route Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/meetings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/meetings", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ title: "Kickoff" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write on this client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Should fail", clientId }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for a member without org-wide clients:write creating an internal meeting", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Should also fail" }));
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists a real client-scoped meeting with attendees", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Kickoff call", clientId, attendeeMembershipIds: [designerMembershipId] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, meetingId: expect.any(String) });

    const stored = await prisma.meeting.findUnique({ where: { id: body.meetingId } });
    expect(stored).toMatchObject({ title: "Kickoff call", clientId, organizationId: orgId });

    const attendees = await prisma.meetingAttendee.findMany({ where: { meetingId: body.meetingId } });
    expect(attendees).toHaveLength(1);
    expect(attendees[0].membershipId).toBe(designerMembershipId);
  });

  it("returns 200 and persists a real internal (clientless) meeting", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "All-hands" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const stored = await prisma.meeting.findUnique({ where: { id: body.meetingId } });
    expect(stored?.clientId).toBeNull();
  });

  it("returns 400 for a client in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Meetings Route Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ title: "Nope", clientId: otherClient.id }));
    expect(res.status).toBe(400);
  });
});
