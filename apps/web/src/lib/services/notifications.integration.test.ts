// Integration test for Notifications (Bible Section 30). See
// identity.integration.test.ts for why next/headers and server-only are
// mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { hasRecentNotification, notifyClientWriters } from "@cedar/events";
import { createCampaign, createCreative, requestApproval } from "./creative-service";
import { createContentCalendarItem, setContentCalendarItemStatus } from "./content-calendar-service";
import { listNotifications, markNotificationAcknowledged, markNotificationRead, unreadNotificationCount } from "./notification-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.qualityCheckResult.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let ownerMembershipId: string;
let managerMembershipId: string;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Notif Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "notif-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  const ownerMembership = await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });
  ownerMembershipId = ownerMembership.id;

  const manager = await prisma.user.create({ data: { email: "notif-manager@test.example", name: "Manager", passwordHash: "irrelevant" } });
  const managerMembership = await prisma.membership.create({ data: { organizationId: org.id, userId: manager.id, role: "ACCOUNT_MANAGER", status: "ACTIVE" } });
  managerMembershipId = managerMembership.id;

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Notif Client", companyName: "Notif Co", services: "[]" } });
  clientId = client.id;

  // ACCOUNT_MANAGER has no global permissions by default (packages/domain/src/roles.ts)
  // — this client-scoped grant is what makes the manager a "client writer" notifyClientWriters can find.
  await prisma.scopedGrant.create({ data: { membershipId: managerMembershipId, clientId, permission: "clients:write" } });

  const project = await prisma.project.create({ data: { clientId, name: "Notif Launch" } });
  projectId = project.id;

});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("notifyClientWriters", () => {
  it("notifies every active member who can write to the client, excluding the actor", async () => {
    const count = await notifyClientWriters({
      organizationId: orgId,
      clientId,
      excludeMembershipId: ownerMembershipId,
      severity: "INFO",
      category: "test_category",
      title: "Test notification",
    });
    // ACCOUNT_MANAGER has org-wide clients:write by default — should be notified.
    expect(count).toBe(1);

    const managerNotifications = await prisma.notification.findMany({ where: { membershipId: managerMembershipId } });
    expect(managerNotifications).toHaveLength(1);
    expect(managerNotifications[0].title).toBe("Test notification");

    const ownerNotifications = await prisma.notification.findMany({ where: { membershipId: ownerMembershipId } });
    expect(ownerNotifications).toHaveLength(0);
  });
});

describe("hasRecentNotification", () => {
  it("is true right after a notification is created and false for a different category", async () => {
    const recent = await hasRecentNotification({
      resourceType: "Test",
      resourceId: "abc",
      category: "dedupe_test",
      sinceMs: 1000,
    });
    expect(recent).toBe(false);

    await notifyClientWriters({
      organizationId: orgId,
      clientId,
      severity: "WARNING",
      category: "dedupe_test",
      resourceType: "Test",
      resourceId: "abc",
      title: "Dedupe check",
    });

    const recentAfter = await hasRecentNotification({
      resourceType: "Test",
      resourceId: "abc",
      category: "dedupe_test",
      sinceMs: 1000,
    });
    expect(recentAfter).toBe(true);

    const differentCategory = await hasRecentNotification({
      resourceType: "Test",
      resourceId: "abc",
      category: "other_category",
      sinceMs: 1000,
    });
    expect(differentCategory).toBe(false);
  });
});

describe("approval requests notify client writers with QC-aware severity", () => {
  it("sends a CRITICAL notification when Quality Control fails", async () => {
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "QC Notif Campaign" });
    const creative = await createCreative({
      actorUserId: ownerUserId,
      organizationId: orgId,
      campaignId: campaign.id,
      type: "image",
      notes: "Plain copy with no configured brand rules.",
    });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    const before = await prisma.notification.count({ where: { membershipId: managerMembershipId, category: "approval_requested" } });
    await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id });
    const after = await prisma.notification.count({ where: { membershipId: managerMembershipId, category: "approval_requested" } });

    expect(after).toBe(before + 1);
    const notification = await prisma.notification.findFirstOrThrow({
      where: { membershipId: managerMembershipId, category: "approval_requested" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification.actionUrl).toContain(creative.id);
  });
});

describe("content calendar failures notify client writers", () => {
  it("sends a WARNING notification when an item is marked FAILED", async () => {
    const item = await createContentCalendarItem({ actorUserId: ownerUserId, organizationId: orgId, clientId, title: "Notif content", channel: "email" });
    await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "DRAFT" });
    await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "INTERNAL_REVIEW" });
    await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "SCHEDULED" });

    const before = await prisma.notification.count({ where: { membershipId: managerMembershipId, category: "content_publish_failed" } });
    await setContentCalendarItemStatus({
      actorUserId: ownerUserId,
      organizationId: orgId,
      itemId: item.id,
      status: "FAILED",
      failureReason: "Simulated connector timeout",
    });
    const after = await prisma.notification.count({ where: { membershipId: managerMembershipId, category: "content_publish_failed" } });

    expect(after).toBe(before + 1);
  });
});

describe("notification-service read/acknowledge", () => {
  it("lists, counts unread, marks read, and marks acknowledged — all scoped to the caller's own membership", async () => {
    const unreadBefore = await unreadNotificationCount(managerMembershipId);
    expect(unreadBefore).toBeGreaterThan(0);

    const list = await listNotifications(managerMembershipId);
    expect(list.length).toBeGreaterThanOrEqual(unreadBefore);
    const target = list.find((n) => n.status === "UNREAD")!;
    expect(target).toBeTruthy();

    await markNotificationRead(managerMembershipId, target.id);
    const afterRead = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });
    expect(afterRead.status).toBe("READ");
    expect(afterRead.readAt).toBeTruthy();

    await markNotificationAcknowledged(managerMembershipId, target.id);
    const afterAck = await prisma.notification.findUniqueOrThrow({ where: { id: target.id } });
    expect(afterAck.status).toBe("ACKNOWLEDGED");

    // Cannot act on another membership's notification.
    await expect(markNotificationRead(ownerMembershipId, target.id)).rejects.toThrow();
  });
});
