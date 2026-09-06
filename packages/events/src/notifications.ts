import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";

export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface NotificationInput {
  organizationId: string;
  membershipId: string;
  severity: NotificationSeverity;
  category: string;
  clientId?: string;
  resourceType?: string;
  resourceId?: string;
  title: string;
  body?: string;
  actionUrl?: string;
}

/**
 * The only writer of Notification rows (Bible Section 30: "In-app
 * notification center with severity, category, client/resource, action,
 * read/acknowledged state"). Low-level and unauthorized by design — it's
 * called by trusted application code (a service that already knows this
 * membership should be told something), never directly from a route
 * handler on unvalidated input.
 */
export async function emitNotification(input: NotificationInput) {
  return prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      severity: input.severity,
      category: input.category,
      clientId: input.clientId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl,
    },
  });
}

/**
 * Notifies every active member who can write to `clientId` — the
 * standard "someone needs to know about this client-scoped event" fan-out
 * (an approval request, a failed publish, an overdue deliverable).
 * Reuses the real authorization decision (`isAuthorized`) rather than a
 * separate "who owns this client" query, so a notification recipient
 * list can never drift from who's actually allowed to act on the client.
 */
export async function notifyClientWriters(
  input: Omit<NotificationInput, "membershipId"> & { clientId: string; excludeMembershipId?: string },
) {
  const memberships = await prisma.membership.findMany({
    where: { organizationId: input.organizationId, status: "ACTIVE" },
  });

  const recipients = await Promise.all(
    memberships
      .filter((m) => m.id !== input.excludeMembershipId)
      .map(async (m) => {
        const allowed = await isAuthorized({
          userId: m.userId,
          organizationId: input.organizationId,
          permission: "clients:write",
          clientId: input.clientId,
        });
        return allowed ? m : null;
      }),
  );

  const notified = recipients.filter((m): m is NonNullable<typeof m> => m !== null);

  await Promise.all(
    notified.map((m) =>
      emitNotification({
        organizationId: input.organizationId,
        membershipId: m.id,
        severity: input.severity,
        category: input.category,
        clientId: input.clientId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
      }),
    ),
  );

  return notified.length;
}

/**
 * True if a notification for this exact resource+category already exists
 * within `sinceMs` — Section 30: "Deduplicate noisy alerts and group
 * repeated integration failures." Used by escalation jobs (apps/worker)
 * so an overdue item gets re-notified on a cadence, not on every poll.
 */
export async function hasRecentNotification(params: {
  resourceType: string;
  resourceId: string;
  category: string;
  sinceMs: number;
}): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      category: params.category,
      createdAt: { gte: new Date(Date.now() - params.sinceMs) },
    },
    select: { id: true },
  });
  return existing !== null;
}
