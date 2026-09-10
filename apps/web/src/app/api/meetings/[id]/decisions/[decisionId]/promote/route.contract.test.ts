// API-contract test for POST /api/meetings/[id]/decisions/[decisionId]/promote.
// See ../../[followUpId]/promote/route.contract.test.ts for the sibling
// route this mirrors (same shared cedarpoint_test database, not reset
// between test files).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { randomUUID } from "node:crypto";
import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.agencyMemoryEntry.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;

async function makeMeetingWithDecision() {
  const decisionId = randomUUID();
  const meeting = await prisma.meeting.create({
    data: {
      organizationId: orgId,
      clientId,
      title: "Promote Decision Meeting",
      decisions: JSON.stringify([
        { id: decisionId, text: "Ship the redesign", rationale: null, createdAt: new Date().toISOString(), promotedToMemoryId: null },
      ]),
    },
  });
  return { meetingId: meeting.id, decisionId };
}

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Decision Promote Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "decision-promote-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "decision-promote-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Decision Promote Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request() {
  return new Request("http://localhost/api/meetings/x/decisions/y/promote", { method: "POST" });
}

describe("POST /api/meetings/[id]/decisions/[decisionId]/promote", () => {
  it("returns 401 when no one is signed in", async () => {
    const { meetingId, decisionId } = await makeMeetingWithDecision();
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request(), { params: Promise.resolve({ id: meetingId, decisionId }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without clients:write on this meeting's client", async () => {
    const { meetingId, decisionId } = await makeMeetingWithDecision();
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: meetingId, decisionId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually creates a real AgencyMemoryEntry, setting promotedToMemoryId", async () => {
    const { meetingId, decisionId } = await makeMeetingWithDecision();
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: meetingId, decisionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, entryId: expect.any(String) });

    const entry = await prisma.agencyMemoryEntry.findUnique({ where: { id: body.entryId } });
    expect(entry).toMatchObject({ content: "Ship the redesign", sourceMeetingId: meetingId, sourceDecisionId: decisionId });

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    const decisions = JSON.parse(meeting!.decisions!);
    expect(decisions.find((d: { id: string }) => d.id === decisionId).promotedToMemoryId).toBe(body.entryId);
  });

  it("returns 400 on a second promotion attempt of the same decision", async () => {
    const { meetingId, decisionId } = await makeMeetingWithDecision();
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    await POST(request(), { params: Promise.resolve({ id: meetingId, decisionId }) });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: meetingId, decisionId }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already been promoted");
  });

  it("returns 400 for an unknown decision id", async () => {
    const { meetingId } = await makeMeetingWithDecision();
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: meetingId, decisionId: "not-a-real-id" }) });
    expect(res.status).toBe(400);
  });
});
