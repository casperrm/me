// API-contract test for POST /api/notifications/mark-all-read. See
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
  const org = await prisma.organization.create({ data: { name: "Mark All Read Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "mark-all-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  const ownerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
  });
  ownerMembershipId = ownerMembership.id;

  const other = await prisma.user.create({
    data: { email: "mark-all-other@test.example", name: "Other", passwordHash: "irrelevant" },
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
  return new Request("http://localhost/api/notifications/mark-all-read", { method: "POST" });
}

describe("POST /api/notifications/mark-all-read", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("marks only the caller's own UNREAD notifications, leaving another membership's untouched", async () => {
    const mine1 = await prisma.notification.create({
      data: { organizationId: orgId, membershipId: ownerMembershipId, severity: "INFO", category: "test", title: "Mine 1" },
    });
    const mine2 = await prisma.notification.create({
      data: { organizationId: orgId, membershipId: ownerMembershipId, severity: "INFO", category: "test", title: "Mine 2" },
    });
    const theirs = await prisma.notification.create({
      data: { organizationId: orgId, membershipId: otherMembershipId, severity: "INFO", category: "test", title: "Theirs" },
    });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId, membership: { id: ownerMembershipId } });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const [stored1, stored2, storedTheirs] = await Promise.all([
      prisma.notification.findUnique({ where: { id: mine1.id } }),
      prisma.notification.findUnique({ where: { id: mine2.id } }),
      prisma.notification.findUnique({ where: { id: theirs.id } }),
    ]);
    expect(stored1?.status).toBe("READ");
    expect(stored2?.status).toBe("READ");
    expect(storedTheirs?.status).toBe("UNREAD");
  });
});
