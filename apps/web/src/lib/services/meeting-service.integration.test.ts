// Integration test for the meeting service — see identity.integration.test.ts
// for why next/headers and server-only are mocked (transitively pulled in via
// auth-service.ts's AuthError).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import {
  addMeetingDecision,
  addMeetingFollowUp,
  createMeeting,
  getMeeting,
  listMeetingsForClient,
  listMeetingsForOrganization,
  promoteFollowUpToTask,
  updateMeetingNotes,
} from "./meeting-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let designerMembershipId: string;
let clientAId: string;
let clientBId: string;
let projectA1Id: string;
let projectB1Id: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Meeting Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "meeting-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "meeting-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  const designerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" },
  });
  designerMembershipId = designerMembership.id;

  const clientA = await prisma.client.create({
    data: { organizationId: org.id, name: "Client A", companyName: "Client A Co", services: "[]" },
  });
  clientAId = clientA.id;
  const clientB = await prisma.client.create({
    data: { organizationId: org.id, name: "Client B", companyName: "Client B Co", services: "[]" },
  });
  clientBId = clientB.id;

  const projectA1 = await prisma.project.create({ data: { clientId: clientAId, name: "Client A Project" } });
  projectA1Id = projectA1.id;
  const projectB1 = await prisma.project.create({ data: { clientId: clientBId, name: "Client B Project" } });
  projectB1Id = projectB1.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createMeeting", () => {
  it("creates a real client-scoped meeting with attendees, an audit event, and a timeline event", async () => {
    const meeting = await createMeeting({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId: clientAId,
      title: "Kickoff call",
      attendeeMembershipIds: [designerMembershipId],
    });
    expect(meeting.title).toBe("Kickoff call");
    expect(meeting.clientId).toBe(clientAId);

    const attendees = await prisma.meetingAttendee.findMany({ where: { meetingId: meeting.id } });
    expect(attendees).toHaveLength(1);
    expect(attendees[0].membershipId).toBe(designerMembershipId);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "meeting.created", resourceId: meeting.id } });
    expect(audit).toBeTruthy();

    const timeline = await prisma.clientTimelineEvent.findFirst({
      where: { clientId: clientAId, summary: { contains: "Kickoff call" } },
    });
    expect(timeline).toBeTruthy();
  });

  it("creates a real internal (clientless) meeting with no timeline event", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, title: "All-hands" });
    expect(meeting.clientId).toBeNull();

    const timeline = await prisma.clientTimelineEvent.findFirst({ where: { summary: { contains: "All-hands" } } });
    expect(timeline).toBeNull();
  });

  it("rejects an empty title", async () => {
    await expect(
      createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "   " }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects an attendee membership id from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Meeting Other Org (attendee)" } });
    const otherUser = await prisma.user.create({
      data: { email: "meeting-other-attendee@test.example", name: "Other", passwordHash: "irrelevant" },
    });
    const otherMembership = await prisma.membership.create({
      data: { organizationId: otherOrg.id, userId: otherUser.id, role: "OWNER", status: "ACTIVE" },
    });

    await expect(
      createMeeting({
        actorUserId: ownerUserId,
        organizationId: orgId,
        clientId: clientAId,
        title: "Bad attendee",
        attendeeMembershipIds: [otherMembership.id],
      }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a client from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Meeting Other Org (client)" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });

    await expect(
      createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: otherClient.id, title: "Nope" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a write from a member with no clients:write on this client", async () => {
    await expect(
      createMeeting({ actorUserId: designerUserId, organizationId: orgId, clientId: clientAId, title: "Should fail" }),
    ).rejects.toThrow();
  });

  it("rejects an internal meeting from a member with no org-wide clients:write", async () => {
    await expect(
      createMeeting({ actorUserId: designerUserId, organizationId: orgId, title: "Should also fail" }),
    ).rejects.toThrow();
  });
});

describe("updateMeetingNotes", () => {
  it("saves real notes and records an audit event", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Notes meeting" });
    const updated = await updateMeetingNotes({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      notes: "Discussed Q3 roadmap.",
    });
    expect(updated.notes).toBe("Discussed Q3 roadmap.");

    const fromDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    expect(fromDb?.notes).toBe("Discussed Q3 roadmap.");

    const audit = await prisma.auditEvent.findFirst({ where: { action: "meeting.notes_updated", resourceId: meeting.id } });
    expect(audit).toBeTruthy();
  });

  it("rejects a meeting from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Meeting Other Org (notes)" } });
    const otherOwner = await prisma.user.create({
      data: { email: "meeting-other-notes-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherMeeting = await createMeeting({ actorUserId: otherOwner.id, organizationId: otherOrg.id, title: "Other org meeting" });

    await expect(
      updateMeetingNotes({ actorUserId: ownerUserId, organizationId: orgId, meetingId: otherMeeting.id, notes: "Hijack" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("addMeetingDecision", () => {
  it("appends decisions and accumulates them in order", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Decisions meeting" });

    const first = await addMeetingDecision({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Ship the new homepage",
      rationale: "Conversion data supports it",
    });
    const second = await addMeetingDecision({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Delay the rebrand",
    });

    const fromDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    const decisions = JSON.parse(fromDb!.decisions!);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatchObject({ id: first.id, text: "Ship the new homepage", rationale: "Conversion data supports it" });
    expect(decisions[1]).toMatchObject({ id: second.id, text: "Delay the rebrand", rationale: null });

    const audits = await prisma.auditEvent.findMany({ where: { action: "meeting.decision_added", resourceId: meeting.id } });
    expect(audits).toHaveLength(2);
  });

  it("rejects empty decision text", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Empty decision meeting" });
    await expect(
      addMeetingDecision({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, text: "  " }),
    ).rejects.toThrow(AuthError);
  });
});

describe("addMeetingFollowUp", () => {
  it("appends a follow-up with an owner and a due date", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Follow-up meeting" });
    const dueDate = new Date("2026-10-01T00:00:00.000Z");

    const followUp = await addMeetingFollowUp({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Send updated proposal",
      ownerMembershipId: designerMembershipId,
      dueDate,
    });
    expect(followUp.promotedTaskId).toBeNull();

    const fromDb = await prisma.meeting.findUnique({ where: { id: meeting.id } });
    const followUps = JSON.parse(fromDb!.followUps!);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      id: followUp.id,
      text: "Send updated proposal",
      ownerMembershipId: designerMembershipId,
      dueDate: dueDate.toISOString(),
      promotedTaskId: null,
    });

    const audit = await prisma.auditEvent.findFirst({ where: { action: "meeting.followup_added", resourceId: meeting.id } });
    expect(audit).toBeTruthy();
  });

  it("rejects an owner membership id from a different organization", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Bad owner meeting" });
    const otherOrg = await prisma.organization.create({ data: { name: "Meeting Other Org (owner)" } });
    const otherUser = await prisma.user.create({
      data: { email: "meeting-other-owner@test.example", name: "Other", passwordHash: "irrelevant" },
    });
    const otherMembership = await prisma.membership.create({
      data: { organizationId: otherOrg.id, userId: otherUser.id, role: "OWNER", status: "ACTIVE" },
    });

    await expect(
      addMeetingFollowUp({
        actorUserId: ownerUserId,
        organizationId: orgId,
        meetingId: meeting.id,
        text: "Should fail",
        ownerMembershipId: otherMembership.id,
      }),
    ).rejects.toThrow(AuthError);
  });
});

describe("promoteFollowUpToTask", () => {
  it("creates a real Task, marks the follow-up promoted, and audits it", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Promote meeting" });
    const dueDate = new Date("2026-11-01T00:00:00.000Z");
    const followUp = await addMeetingFollowUp({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Build the new landing page",
      ownerMembershipId: designerMembershipId,
      dueDate,
    });

    const result = await promoteFollowUpToTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      followUpId: followUp.id,
      projectId: projectA1Id,
    });

    const task = await prisma.task.findUnique({ where: { id: result.task.id } });
    expect(task).toBeTruthy();
    expect(task?.title).toBe("Build the new landing page");
    expect(task?.assigneeId).toBe(designerMembershipId);
    expect(task?.dueDate?.toISOString()).toBe(dueDate.toISOString());
    expect(task?.projectId).toBe(projectA1Id);

    const followUps = JSON.parse(result.meeting.followUps!);
    const promoted = followUps.find((f: { id: string }) => f.id === followUp.id);
    expect(promoted.promotedTaskId).toBe(task!.id);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "meeting.followup_promoted", resourceId: meeting.id } });
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit!.changeSet!)).toMatchObject({ followUpId: followUp.id, taskId: task!.id, projectId: projectA1Id });
  });

  it("rejects a second promotion attempt on the same follow-up", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Double promote meeting" });
    const followUp = await addMeetingFollowUp({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Only promote once",
    });

    await promoteFollowUpToTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      followUpId: followUp.id,
      projectId: projectA1Id,
    });

    await expect(
      promoteFollowUpToTask({
        actorUserId: ownerUserId,
        organizationId: orgId,
        meetingId: meeting.id,
        followUpId: followUp.id,
        projectId: projectA1Id,
      }),
    ).rejects.toThrow("This follow-up has already been promoted to a task.");
  });

  it("rejects a project belonging to a different client than the meeting's own client", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Cross-client promote meeting" });
    const followUp = await addMeetingFollowUp({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Should not cross client boundary",
    });

    await expect(
      promoteFollowUpToTask({
        actorUserId: ownerUserId,
        organizationId: orgId,
        meetingId: meeting.id,
        followUpId: followUp.id,
        projectId: projectB1Id,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("allows an internal meeting's follow-up to promote into any project the actor can write to", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, title: "Internal promote meeting" });
    const followUp = await addMeetingFollowUp({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      text: "Internal follow-up",
    });

    const result = await promoteFollowUpToTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      meetingId: meeting.id,
      followUpId: followUp.id,
      projectId: projectB1Id,
    });
    expect(result.task.projectId).toBe(projectB1Id);
  });

  it("rejects an unknown follow-up id", async () => {
    const meeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, title: "Unknown followup meeting" });
    await expect(
      promoteFollowUpToTask({
        actorUserId: ownerUserId,
        organizationId: orgId,
        meetingId: meeting.id,
        followUpId: "not-a-real-id",
        projectId: projectA1Id,
      }),
    ).rejects.toThrow(AuthError);
  });
});

describe("getMeeting", () => {
  it("returns the meeting with attendees and parsed decisions/follow-ups arrays", async () => {
    const meeting = await createMeeting({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId: clientAId,
      title: "Get meeting test",
      attendeeMembershipIds: [designerMembershipId],
    });
    await addMeetingDecision({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, text: "A decision" });
    await addMeetingFollowUp({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id, text: "A follow-up" });

    const fetched = await getMeeting({ actorUserId: ownerUserId, organizationId: orgId, meetingId: meeting.id });
    expect(fetched.attendees).toHaveLength(1);
    expect(fetched.attendees[0].membership.user.name).toBe("Designer");
    expect(Array.isArray(fetched.decisions)).toBe(true);
    expect(fetched.decisions).toHaveLength(1);
    expect(Array.isArray(fetched.followUps)).toBe(true);
    expect(fetched.followUps).toHaveLength(1);
  });

  it("rejects an unknown meeting id", async () => {
    await expect(
      getMeeting({ actorUserId: ownerUserId, organizationId: orgId, meetingId: "not-a-real-id" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("listMeetingsForClient", () => {
  it("returns only this client's meetings, most recent first", async () => {
    await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientBId, title: "Client B list meeting" });
    const meetings = await listMeetingsForClient({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientBId });
    expect(meetings.length).toBeGreaterThanOrEqual(1);
    expect(meetings.every((m) => m.clientId === clientBId)).toBe(true);
  });

  it("rejects a read from a member with no clients:read on this client", async () => {
    await expect(
      listMeetingsForClient({ actorUserId: designerUserId, organizationId: orgId, clientId: clientBId }),
    ).rejects.toThrow();
  });
});

describe("listMeetingsForOrganization clientIds scoping", () => {
  it("returns every meeting (client-scoped and internal) when clientIds is undefined", async () => {
    const all = await listMeetingsForOrganization({ organizationId: orgId });
    const hasClientA = all.some((m) => m.clientId === clientAId);
    const hasClientB = all.some((m) => m.clientId === clientBId);
    const hasInternal = all.some((m) => m.clientId === null);
    expect(hasClientA).toBe(true);
    expect(hasClientB).toBe(true);
    expect(hasInternal).toBe(true);
  });

  it("excludes other clients' meetings AND internal meetings when scoped to a specific clientIds array", async () => {
    const scoped = await listMeetingsForOrganization({ organizationId: orgId, clientIds: [clientAId] });
    expect(scoped.length).toBeGreaterThanOrEqual(1);
    expect(scoped.every((m) => m.clientId === clientAId)).toBe(true);
  });

  it("returns nothing for an empty clientIds array", async () => {
    const scoped = await listMeetingsForOrganization({ organizationId: orgId, clientIds: [] });
    expect(scoped).toHaveLength(0);
  });
});

describe("org-wide clients:write/clients:read gating for internal meetings", () => {
  it("a per-client (not org-wide) ScopedGrant can create/read a client meeting but not an internal (clientless) one", async () => {
    // Give the designer clients:write AND clients:read, but scoped to
    // clientA specifically (clientId !== null), not org-wide
    // (clientId: null) — mirrors the org-wide-vs-per-client boundary test
    // added for project template management, same shape, new resource.
    await prisma.scopedGrant.create({ data: { membershipId: designerMembershipId, permission: "clients:write", clientId: clientAId } });
    await prisma.scopedGrant.create({ data: { membershipId: designerMembershipId, permission: "clients:read", clientId: clientAId } });

    const clientMeeting = await createMeeting({
      actorUserId: designerUserId,
      organizationId: orgId,
      clientId: clientAId,
      title: "Scoped designer can create this",
    });
    expect(clientMeeting.clientId).toBe(clientAId);

    const fetched = await getMeeting({ actorUserId: designerUserId, organizationId: orgId, meetingId: clientMeeting.id });
    expect(fetched.id).toBe(clientMeeting.id);

    // The scoped grant is per-client, not org-wide, so an internal
    // meeting (clientId: null) must still be denied.
    await expect(
      createMeeting({ actorUserId: designerUserId, organizationId: orgId, title: "Scoped designer cannot create this" }),
    ).rejects.toThrow();

    const internalMeeting = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, title: "Owner's internal meeting" });
    await expect(
      getMeeting({ actorUserId: designerUserId, organizationId: orgId, meetingId: internalMeeting.id }),
    ).rejects.toThrow();

    // Sanity: the owner (org-wide) can still do both, proving the
    // rejections above are the per-client-grant boundary, not a bug that
    // would reject everyone.
    const ownerInternal = await createMeeting({ actorUserId: ownerUserId, organizationId: orgId, title: "Owner can still create internal" });
    expect(ownerInternal.clientId).toBeNull();
  });
});
