import { prisma } from "@cedar/db";

/**
 * Every function here scopes strictly to the caller's own membership —
 * a notification is a personal inbox, never something one member reads
 * or acknowledges on another's behalf (Section 30).
 */
export async function listNotifications(membershipId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { membershipId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { client: { select: { name: true } } },
  });
}

export async function unreadNotificationCount(membershipId: string) {
  return prisma.notification.count({ where: { membershipId, status: "UNREAD" } });
}

async function assertOwnedByMembership(notificationId: string, membershipId: string) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, membershipId } });
  if (!notification) throw new Error("Notification not found.");
  return notification;
}

export async function markNotificationRead(membershipId: string, notificationId: string) {
  await assertOwnedByMembership(notificationId, membershipId);
  return prisma.notification.update({
    where: { id: notificationId },
    data: { status: "READ", readAt: new Date() },
  });
}

export async function markNotificationAcknowledged(membershipId: string, notificationId: string) {
  await assertOwnedByMembership(notificationId, membershipId);
  return prisma.notification.update({
    where: { id: notificationId },
    data: { status: "ACKNOWLEDGED", readAt: new Date() },
  });
}

export async function markAllNotificationsRead(membershipId: string) {
  await prisma.notification.updateMany({
    where: { membershipId, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
}
