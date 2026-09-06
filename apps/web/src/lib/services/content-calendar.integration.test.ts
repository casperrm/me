// Integration test for the Content Calendar service (Bible Section 9).
// See identity.integration.test.ts for why next/headers and server-only
// are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { createContentCalendarItem, setContentCalendarItemStatus } from "./content-calendar-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Content Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "content-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Content Client", companyName: "Content Co", services: "[]" },
  });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createContentCalendarItem", () => {
  it("creates an item scoped to the client", async () => {
    const item = await createContentCalendarItem({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      title: "Launch teaser reel",
      channel: "instagram",
      contentPillar: "product",
      format: "reel",
    });

    expect(item.status).toBe("BRIEF");
    expect(item.clientId).toBe(clientId);
  });

  it("rejects a campaign that doesn't belong to the client", async () => {
    const otherClient = await prisma.client.create({
      data: { organizationId: orgId, name: "Other Client", companyName: "Other Co", services: "[]" },
    });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherCampaign = await prisma.campaign.create({ data: { projectId: otherProject.id, name: "Other Campaign" } });

    await expect(
      createContentCalendarItem({
        actorUserId: ownerUserId,
        organizationId: orgId,
        clientId,
        title: "Bad link",
        channel: "tiktok",
        campaignId: otherCampaign.id,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a member with no clients:write on this client", async () => {
    const designer = await prisma.user.create({
      data: { email: "content-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: orgId, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

    await expect(
      createContentCalendarItem({ actorUserId: designer.id, organizationId: orgId, clientId, title: "Nope", channel: "email" }),
    ).rejects.toThrow();
  });
});

describe("setContentCalendarItemStatus — Section 9 workflow", () => {
  it("walks brief -> draft -> internal review -> client approval -> scheduled -> published", async () => {
    const item = await createContentCalendarItem({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      title: "Full lifecycle post",
      channel: "linkedin",
    });

    let updated = await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "DRAFT" });
    expect(updated.status).toBe("DRAFT");

    updated = await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "INTERNAL_REVIEW" });
    expect(updated.status).toBe("INTERNAL_REVIEW");

    updated = await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "CLIENT_APPROVAL" });
    expect(updated.status).toBe("CLIENT_APPROVAL");

    updated = await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "SCHEDULED" });
    expect(updated.status).toBe("SCHEDULED");

    updated = await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "PUBLISHED" });
    expect(updated.status).toBe("PUBLISHED");
  });

  it("rejects skipping a step (BRIEF straight to SCHEDULED)", async () => {
    const item = await createContentCalendarItem({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      title: "Cannot skip",
      channel: "email",
    });

    await expect(
      setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "SCHEDULED" }),
    ).rejects.toThrow(AuthError);
  });

  it("requires a failure reason to mark an item failed, then allows rescheduling", async () => {
    const item = await createContentCalendarItem({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      title: "Will fail once",
      channel: "tiktok",
    });
    await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "DRAFT" });
    await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "INTERNAL_REVIEW" });
    await setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "SCHEDULED" });

    await expect(
      setContentCalendarItemStatus({ actorUserId: ownerUserId, organizationId: orgId, itemId: item.id, status: "FAILED" }),
    ).rejects.toThrow(AuthError);

    const failed = await setContentCalendarItemStatus({
      actorUserId: ownerUserId,
      organizationId: orgId,
      itemId: item.id,
      status: "FAILED",
      failureReason: "Connector timed out",
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.failureReason).toBe("Connector timed out");

    const rescheduled = await setContentCalendarItemStatus({
      actorUserId: ownerUserId,
      organizationId: orgId,
      itemId: item.id,
      status: "SCHEDULED",
    });
    expect(rescheduled.status).toBe("SCHEDULED");
    expect(rescheduled.failureReason).toBeNull();
  });
});
