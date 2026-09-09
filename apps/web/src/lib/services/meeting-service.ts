import { randomUUID } from "node:crypto";
import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";
import { createTask } from "./project-service";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export interface MeetingDecision {
  id: string;
  text: string;
  rationale: string | null;
  createdAt: string;
}

export interface MeetingFollowUp {
  id: string;
  text: string;
  ownerMembershipId: string | null;
  dueDate: string | null;
  promotedTaskId: string | null;
}

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

async function assertMeetingInOrg(meetingId: string, organizationId: string) {
  const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, organizationId } });
  if (!meeting) throw new AuthError("Meeting not found.");
  return meeting;
}

/**
 * Section 13's permission gating — a deliberate reuse, not a new
 * permission: there is no `meetings:*` entry in the Permission catalog
 * (packages/domain/src/roles.ts's own doc comment: "Extend it as each
 * module lands rather than pre-declaring permissions nothing checks yet"),
 * and `project-template-service.ts` already precedents exactly this
 * "sometimes client-scoped, sometimes org-wide" shape. A meeting tied to
 * a client is gated by that client's `clients:write`/`clients:read`; an
 * internal meeting (no `clientId`) is gated org-wide (`clientId`
 * omitted), which `can()` restricts to OWNER, ADMIN, or an explicit
 * org-wide ScopedGrant — never a per-client-only collaborator.
 */
async function requireMeetingPermission(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string | null;
  permission: "clients:read" | "clients:write";
}) {
  return requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: params.permission,
    clientId: params.clientId ?? undefined,
  });
}

/**
 * Section 13's "Meeting record" — the smallest real cut: participants,
 * client (optional — an internal meeting is a real case), title, and a
 * time. Agenda/transcript-reference/summary aren't built (see
 * docs/specs/meetings.md) — this is the structural record a human fills
 * in, not an AI-populated one.
 */
export async function createMeeting(params: {
  actorUserId: string;
  organizationId: string;
  clientId?: string;
  title: string;
  occurredAt?: Date;
  attendeeMembershipIds?: string[];
}) {
  if (params.clientId) {
    await assertClientInOrg(params.clientId, params.organizationId);
  }

  const membership = await requireMeetingPermission({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    clientId: params.clientId ?? null,
    permission: "clients:write",
  });

  const title = params.title.trim();
  if (!title) throw new AuthError("Meeting title is required.");

  const attendeeIds = [...new Set(params.attendeeMembershipIds ?? [])];
  if (attendeeIds.length > 0) {
    const validCount = await prisma.membership.count({
      where: { id: { in: attendeeIds }, organizationId: params.organizationId },
    });
    if (validCount !== attendeeIds.length) {
      throw new AuthError("One or more attendees are not members of this organization.");
    }
  }

  const meeting = await prisma.$transaction(async (tx) => {
    const created = await tx.meeting.create({
      data: {
        organizationId: params.organizationId,
        clientId: params.clientId,
        title,
        occurredAt: params.occurredAt ?? new Date(),
      },
    });
    if (attendeeIds.length > 0) {
      await tx.meetingAttendee.createMany({
        data: attendeeIds.map((membershipId) => ({ meetingId: created.id, membershipId })),
      });
    }
    return created;
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "meeting.created",
    resourceType: "Meeting",
    resourceId: meeting.id,
    clientId: params.clientId ?? null,
    result: "SUCCESS",
    changeSet: { title: meeting.title, clientId: params.clientId ?? null, attendeeCount: attendeeIds.length },
  });

  if (params.clientId) {
    await prisma.clientTimelineEvent.create({
      data: { clientId: params.clientId, type: "meeting_created", summary: `Meeting "${meeting.title}" logged.` },
    });
  }

  return meeting;
}

export async function updateMeetingNotes(params: {
  actorUserId: string;
  organizationId: string;
  meetingId: string;
  notes: string;
}) {
  const meeting = await assertMeetingInOrg(params.meetingId, params.organizationId);
  const membership = await requireMeetingPermission({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    clientId: meeting.clientId,
    permission: "clients:write",
  });

  const updated = await prisma.meeting.update({ where: { id: meeting.id }, data: { notes: params.notes } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "meeting.notes_updated",
    resourceType: "Meeting",
    resourceId: meeting.id,
    clientId: meeting.clientId,
    result: "SUCCESS",
    changeSet: { notesLength: params.notes.length },
  });

  return updated;
}

/**
 * A simple, real, user-entered record — deliberately NOT a separate
 * approval workflow with an "approver"/evidence/affected-resources model.
 * That would duplicate Section 15.1's existing Approval engine for a
 * different resource type, real scope creep for a first cut. See
 * docs/specs/meetings.md for the explicit boundary.
 */
export async function addMeetingDecision(params: {
  actorUserId: string;
  organizationId: string;
  meetingId: string;
  text: string;
  rationale?: string;
}) {
  const meeting = await assertMeetingInOrg(params.meetingId, params.organizationId);
  const membership = await requireMeetingPermission({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    clientId: meeting.clientId,
    permission: "clients:write",
  });

  const text = params.text.trim();
  if (!text) throw new AuthError("Decision text is required.");

  const decisions = parseJSON<MeetingDecision[]>(meeting.decisions, []);
  const decision: MeetingDecision = {
    id: randomUUID(),
    text,
    rationale: params.rationale?.trim() || null,
    createdAt: new Date().toISOString(),
  };
  decisions.push(decision);

  await prisma.meeting.update({ where: { id: meeting.id }, data: { decisions: JSON.stringify(decisions) } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "meeting.decision_added",
    resourceType: "Meeting",
    resourceId: meeting.id,
    clientId: meeting.clientId,
    result: "SUCCESS",
    changeSet: { decisionId: decision.id, text: decision.text },
  });

  return decision;
}

export async function addMeetingFollowUp(params: {
  actorUserId: string;
  organizationId: string;
  meetingId: string;
  text: string;
  ownerMembershipId?: string;
  dueDate?: Date;
}) {
  const meeting = await assertMeetingInOrg(params.meetingId, params.organizationId);
  const membership = await requireMeetingPermission({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    clientId: meeting.clientId,
    permission: "clients:write",
  });

  const text = params.text.trim();
  if (!text) throw new AuthError("Follow-up text is required.");

  if (params.ownerMembershipId) {
    const owner = await prisma.membership.findFirst({
      where: { id: params.ownerMembershipId, organizationId: params.organizationId },
    });
    if (!owner) throw new AuthError("Follow-up owner is not a member of this organization.");
  }

  const followUps = parseJSON<MeetingFollowUp[]>(meeting.followUps, []);
  const followUp: MeetingFollowUp = {
    id: randomUUID(),
    text,
    ownerMembershipId: params.ownerMembershipId ?? null,
    dueDate: params.dueDate ? params.dueDate.toISOString() : null,
    promotedTaskId: null,
  };
  followUps.push(followUp);

  await prisma.meeting.update({ where: { id: meeting.id }, data: { followUps: JSON.stringify(followUps) } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "meeting.followup_added",
    resourceType: "Meeting",
    resourceId: meeting.id,
    clientId: meeting.clientId,
    result: "SUCCESS",
    changeSet: { followUpId: followUp.id, text: followUp.text },
  });

  return followUp;
}

/**
 * The concrete, buildable half of Section 13's "approved meeting
 * decisions update relevant client/project context" — turning a
 * follow-up into a real, trackable Task by reusing the existing
 * `createTask` (project-service.ts) rather than reimplementing task
 * creation. A client meeting's follow-up can only be promoted into a
 * project under that SAME client (an internal meeting's follow-up can go
 * to any project the actor can write to) — see docs/specs/meetings.md.
 */
export async function promoteFollowUpToTask(params: {
  actorUserId: string;
  organizationId: string;
  meetingId: string;
  followUpId: string;
  projectId: string;
}) {
  const meeting = await assertMeetingInOrg(params.meetingId, params.organizationId);
  const membership = await requireMeetingPermission({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    clientId: meeting.clientId,
    permission: "clients:write",
  });

  const followUps = parseJSON<MeetingFollowUp[]>(meeting.followUps, []);
  const index = followUps.findIndex((f) => f.id === params.followUpId);
  if (index === -1) throw new AuthError("Follow-up not found.");
  const followUp = followUps[index];
  if (followUp.promotedTaskId) {
    throw new AuthError("This follow-up has already been promoted to a task.");
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, client: { organizationId: params.organizationId } },
    include: { client: true },
  });
  if (!project) throw new AuthError("Project not found.");

  if (meeting.clientId && project.clientId !== meeting.clientId) {
    throw new AuthError("This project doesn't belong to the meeting's client.");
  }

  const task = await createTask({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    projectId: project.id,
    title: followUp.text,
    assigneeId: followUp.ownerMembershipId ?? undefined,
    dueDate: followUp.dueDate ? new Date(followUp.dueDate) : undefined,
  });

  followUps[index] = { ...followUp, promotedTaskId: task.id };
  const updatedMeeting = await prisma.meeting.update({
    where: { id: meeting.id },
    data: { followUps: JSON.stringify(followUps) },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "meeting.followup_promoted",
    resourceType: "Meeting",
    resourceId: meeting.id,
    clientId: meeting.clientId,
    result: "SUCCESS",
    changeSet: { followUpId: followUp.id, taskId: task.id, projectId: project.id },
  });

  return { task, meeting: updatedMeeting };
}

export async function getMeeting(params: { actorUserId: string; organizationId: string; meetingId: string }) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: params.meetingId, organizationId: params.organizationId },
    include: {
      client: true,
      attendees: { include: { membership: { include: { user: true } } } },
    },
  });
  if (!meeting) throw new AuthError("Meeting not found.");

  await requireMeetingPermission({
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    clientId: meeting.clientId,
    permission: "clients:read",
  });

  return {
    ...meeting,
    decisions: parseJSON<MeetingDecision[]>(meeting.decisions, []),
    followUps: parseJSON<MeetingFollowUp[]>(meeting.followUps, []),
  };
}

export async function listMeetingsForClient(params: { actorUserId: string; organizationId: string; clientId: string }) {
  await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:read",
    clientId: params.clientId,
  });

  return prisma.meeting.findMany({
    where: { organizationId: params.organizationId, clientId: params.clientId },
    include: { attendees: { include: { membership: { include: { user: true } } } } },
    orderBy: { occurredAt: "desc" },
  });
}

/**
 * Follows `calendar-service.ts`/`search-service.ts`'s established
 * contract exactly: `clientIds` is an already-resolved scope, not
 * something this function authorizes itself — no `requirePermission`
 * here. `undefined` means "every client the caller can read, i.e. an
 * org-wide reader" and returns every meeting including internal
 * (clientless) ones; a specific array scopes to exactly those clients'
 * meetings and deliberately excludes internal meetings too, since those
 * aren't part of a scoped reader's granted scope. The caller (the
 * `/meetings` page) computes `clientIds` via `getReadableClientIds`
 * first, exactly like `/calendar`'s page already does.
 */
export async function listMeetingsForOrganization(params: { organizationId: string; clientIds?: string[] }) {
  const where = params.clientIds
    ? { organizationId: params.organizationId, clientId: { in: params.clientIds } }
    : { organizationId: params.organizationId };

  return prisma.meeting.findMany({
    where,
    include: { client: true, attendees: { include: { membership: { include: { user: true } } } } },
    orderBy: { occurredAt: "desc" },
  });
}
