import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";

const PAGE_SIZE = 30;

export interface AuditLogEntry {
  id: string;
  actorType: string;
  actorLabel: string;
  action: string;
  resourceType: string;
  resourceId: string;
  clientId: string | null;
  clientName: string | null;
  result: string;
  approvalId: string | null;
  correlationId: string | null;
  timestamp: Date;
  changeSet: string | null;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  totalCount: number;
  totalPages: number;
  page: number;
}

/**
 * Section 23.2's "Audit Event Minimum Schema" has been fully populated by
 * every write path in this app since Phase 0 (`emitAuditEvent`) — but
 * nothing has ever read it back. `audit:read` has been a real permission
 * in the catalog (`packages/domain/src/roles.ts`, granted to ADMIN/OWNER
 * automatically, `organization:manage` roles' org-wide default) since
 * that same Phase 0, with zero call sites checking it anywhere in this
 * codebase until this function — a genuine "declared but never wired"
 * gap, the same shape as `AuditEvent.approvalId` before
 * `docs/specs/audit-event-approval-linkage.md`, which itself named "no UI
 * surfaces approvalId yet" as the explicit follow-up this closes.
 *
 * Org-wide, not client-scoped — `audit:read` is not in
 * `CLIENT_SCOPABLE_PERMISSIONS`, matching how audit oversight is
 * inherently an org-wide concern (the same reasoning `/command/supervisor`
 * already uses for `ai:supervise`), not a per-client one, even though
 * individual rows carry a `clientId` when relevant.
 */
export async function listAuditEvents(params: {
  actorUserId: string;
  organizationId: string;
  page?: number;
  resourceType?: string;
}): Promise<AuditLogPage> {
  await requirePermission({ userId: params.actorUserId, organizationId: params.organizationId, permission: "audit:read" });

  const page = params.page && params.page >= 1 ? Math.floor(params.page) : 1;
  const where = {
    organizationId: params.organizationId,
    ...(params.resourceType ? { resourceType: params.resourceType } : {}),
  };

  const [events, totalCount] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  const membershipIds = [...new Set(events.filter((e) => e.actorType === "USER" && e.actorId).map((e) => e.actorId as string))];
  const clientIds = [...new Set(events.filter((e) => e.clientId).map((e) => e.clientId as string))];

  const [memberships, clients] = await Promise.all([
    membershipIds.length > 0
      ? prisma.membership.findMany({ where: { id: { in: membershipIds } }, include: { user: { select: { name: true } } } })
      : Promise.resolve([]),
    clientIds.length > 0
      ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const memberNames = new Map(memberships.map((m) => [m.id, m.user.name]));
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));

  const entries: AuditLogEntry[] = events.map((e) => ({
    id: e.id,
    actorType: e.actorType,
    actorLabel:
      e.actorType === "USER"
        ? (e.actorId && memberNames.get(e.actorId)) || "Unknown member"
        : e.actorType === "AI_AGENT"
          ? (e.actorId ?? "AI agent")
          : "System",
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    clientId: e.clientId,
    clientName: e.clientId ? (clientNames.get(e.clientId) ?? null) : null,
    result: e.result,
    approvalId: e.approvalId,
    correlationId: e.correlationId,
    timestamp: e.timestamp,
    changeSet: e.changeSet,
  }));

  return { entries, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), page };
}
