import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";
import type { MeetingDecision } from "./meeting-service";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Section 19.2 (Knowledge Promotion): "Raw AI output is not automatically
 * institutional knowledge. Promotion requires an approved outcome,
 * explicit curation, a verified external source, or a defined system
 * rule." Section 13's own text names the first real trigger this v1
 * supports: "Approved meeting decisions... can be promoted into memory."
 * The only path that creates an `AgencyMemoryEntry` is this function,
 * called only from a person clicking "Promote to Agency Memory" — never
 * an automatic write, matching "explicit curation."
 *
 * Gated the same way `addMeetingDecision`/`promoteFollowUpToTask` already
 * gate meeting writes: `clients:write` scoped to the meeting's client
 * when it has one, org-wide for an internal meeting.
 */
export async function promoteMeetingDecisionToMemory(params: {
  actorUserId: string;
  organizationId: string;
  meetingId: string;
  decisionId: string;
}) {
  const meeting = await prisma.meeting.findFirst({ where: { id: params.meetingId, organizationId: params.organizationId } });
  if (!meeting) throw new AuthError("Meeting not found.");

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: meeting.clientId ?? undefined,
  });

  const decisions = parseJSON<MeetingDecision[]>(meeting.decisions, []);
  const index = decisions.findIndex((d) => d.id === params.decisionId);
  if (index === -1) throw new AuthError("Decision not found.");
  const decision = decisions[index];
  if (decision.promotedToMemoryId) {
    throw new AuthError("This decision has already been promoted to Agency Memory.");
  }

  const entry = await prisma.agencyMemoryEntry.create({
    data: {
      organizationId: params.organizationId,
      content: decision.text,
      sourceMeetingId: meeting.id,
      sourceDecisionId: decision.id,
      clientId: meeting.clientId,
      promotedByMembershipId: membership.id,
    },
  });

  decisions[index] = { ...decision, promotedToMemoryId: entry.id };
  await prisma.meeting.update({ where: { id: meeting.id }, data: { decisions: JSON.stringify(decisions) } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "agency_memory.promoted",
    resourceType: "AgencyMemoryEntry",
    resourceId: entry.id,
    clientId: meeting.clientId,
    result: "SUCCESS",
    changeSet: { sourceMeetingId: meeting.id, sourceDecisionId: decision.id, content: decision.text },
  });

  return entry;
}

export interface AgencyMemoryEntrySummary {
  id: string;
  content: string;
  clientId: string | null;
  clientName: string | null;
  sourceMeetingId: string;
  promotedByName: string;
  promotedAt: Date;
}

const RECENT_ENTRIES_LIMIT = 50;

/**
 * Org-wide listing — Agency Memory is deliberately not client-scoped even
 * though most entries originate from one client's meeting (Section 6.6's
 * own Memory Layers table distinguishes it from Client Memory: agency-wide
 * "campaigns, creative patterns, SOPs, decisions, lessons"). Gated the
 * same org-wide way `listProjectTemplatesForManagement` gates the other
 * shared, curated resource in this codebase: `clients:write` with no
 * `clientId`.
 */
export async function listAgencyMemoryEntries(params: {
  actorUserId: string;
  organizationId: string;
}): Promise<AgencyMemoryEntrySummary[]> {
  await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
  });

  const entries = await prisma.agencyMemoryEntry.findMany({
    where: { organizationId: params.organizationId },
    orderBy: { promotedAt: "desc" },
    take: RECENT_ENTRIES_LIMIT,
  });

  const clientIds = [...new Set(entries.map((e) => e.clientId).filter((id): id is string => Boolean(id)))];
  const membershipIds = [...new Set(entries.map((e) => e.promotedByMembershipId))];

  const [clients, memberships] = await Promise.all([
    clientIds.length > 0
      ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.membership.findMany({ where: { id: { in: membershipIds } }, include: { user: true } }),
  ]);
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const memberNames = new Map(memberships.map((m) => [m.id, m.user.name]));

  return entries.map((e) => ({
    id: e.id,
    content: e.content,
    clientId: e.clientId,
    clientName: e.clientId ? (clientNames.get(e.clientId) ?? null) : null,
    sourceMeetingId: e.sourceMeetingId,
    promotedByName: memberNames.get(e.promotedByMembershipId) ?? "Unknown",
    promotedAt: e.promotedAt,
  }));
}
