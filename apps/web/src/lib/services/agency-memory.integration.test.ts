// Integration test for Cedar Knowledge Promotion v1 (Bible Section 19.2 /
// 6.6's Agency Memory row). See identity.integration.test.ts for why
// next/headers and server-only are mocked (transitively pulled in via
// auth-service.ts's AuthError, and meeting-service.ts's own AuthError use).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { addMeetingDecision, createMeeting } from "./meeting-service";
import { listAgencyMemoryEntries, promoteMeetingDecisionToMemory } from "./agency-memory-service";

async function wipeDatabase() {
  await prisma.agencyMemoryEntry.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Agency Memory Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "memory-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "memory-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Memory Client", companyName: "Memory Co", services: "[]" },
  });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("promoteMeetingDecisionToMemory", () => {
  it("creates a real AgencyMemoryEntry, marks the decision promoted, and emits an audit event", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId, title: "Promotion Test Meeting" });
    const decision = await addMeetingDecision({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Always lead creative with the product, never the logo.",
      rationale: "Tested 2x higher engagement across three campaigns.",
    });

    const entry = await promoteMeetingDecisionToMemory({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      decisionId: decision.id,
    });

    expect(entry.content).toBe("Always lead creative with the product, never the logo.");
    expect(entry.clientId).toBe(clientId);
    expect(entry.sourceMeetingId).toBe(meeting.id);
    expect(entry.sourceDecisionId).toBe(decision.id);

    const updatedMeeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meeting.id } });
    const decisions = JSON.parse(updatedMeeting.decisions ?? "[]") as { id: string; promotedToMemoryId: string | null }[];
    expect(decisions.find((d) => d.id === decision.id)?.promotedToMemoryId).toBe(entry.id);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "agency_memory.promoted", resourceId: entry.id } });
    expect(audit).toBeTruthy();
    expect(audit?.clientId).toBe(clientId);
  });

  it("rejects promoting the same decision twice", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId, title: "Double Promote Meeting" });
    const decision = await addMeetingDecision({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Only decision here.",
    });

    await promoteMeetingDecisionToMemory({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, decisionId: decision.id });

    await expect(
      promoteMeetingDecisionToMemory({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, decisionId: decision.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a member with no clients:write on this client", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId, title: "Perm Check Meeting" });
    const decision = await addMeetingDecision({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, text: "Guarded decision." });

    await expect(
      promoteMeetingDecisionToMemory({ actorUserId: designerUserId, organizationId: orgId, meetingId: meeting.id, decisionId: decision.id }),
    ).rejects.toThrow();
  });

  it("rejects an unknown decision id", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId, title: "Unknown Decision Meeting" });

    await expect(
      promoteMeetingDecisionToMemory({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, decisionId: "not-a-real-id" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("listAgencyMemoryEntries", () => {
  it("returns real promoted entries org-wide, newest first, with client and promoter names resolved", async () => {
    await prisma.agencyMemoryEntry.deleteMany();

    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId, title: "Listing Meeting" });
    const first = await addMeetingDecision({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, text: "First decision." });
    const second = await addMeetingDecision({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, text: "Second decision." });

    await promoteMeetingDecisionToMemory({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, decisionId: first.id });
    await promoteMeetingDecisionToMemory({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, decisionId: second.id });

    const entries = await listAgencyMemoryEntries({ actorUserId: ownerUserId, organizationId: orgId });

    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe("Second decision.");
    expect(entries[1].content).toBe("First decision.");
    expect(entries[0].clientName).toBe("Memory Client");
    expect(entries[0].promotedByName).toBe("Owner");
  });

  it("rejects a member with no org-wide clients:write", async () => {
    await expect(listAgencyMemoryEntries({ actorUserId: designerUserId, organizationId: orgId })).rejects.toThrow();
  });
});
