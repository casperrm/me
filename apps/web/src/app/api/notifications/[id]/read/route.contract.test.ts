// API-contract test for POST /api/notifications/[id]/read. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.notification.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let ownerMembershipId: string;
let otherMembershipId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Notification Read Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "notif-read-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  const ownerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
  });
  ownerMembershipId = ownerMembership.id;

  const other = await prisma.user.create({
    data: { email: "notif-read-other@test.example", name: "Other", passwordHash: "irrelevant" },
  });
  const otherMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: other.id, role: "ADMIN", status: "ACTIVE" },
  });
  otherMembershipId = otherMembership.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request() {
  return new Request("http://localhost/api/notifications/x/read", { method: "POST" });
}

describe("POST /api/notifications/[id]/read", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request(), { params: Promise.resolve({ id: "does-not-matter" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a notification that doesn't belong to the caller's own membership", async () => {
    const notification = await prisma.notification.create({
      data: { organizationId: orgId, membershipId: otherMembershipId, severity: "INFO", category: "test", title: "For someone else" },
    });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId, membership: { id: ownerMembershipId } });
    const res = await POST(request(), { params: Promise.resolve({ id: notification.id }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 and actually marks the caller's own notification READ", async () => {
    const notification = await prisma.notification.create({
      data: { organizationId: orgId, membershipId: ownerMembershipId, severity: "INFO", category: "test", title: "For the owner" },
    });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId, membership: { id: ownerMembershipId } });
    const res = await POST(request(), { params: Promise.resolve({ id: notification.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.notification.findUnique({ where: { id: notification.id } });
    expect(stored?.status).toBe("READ");
    expect(stored?.readAt).not.toBeNull();
  });
});
