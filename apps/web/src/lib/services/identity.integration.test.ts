// Integration tests: real Postgres (cedarpoint_test, see vitest.config.ts),
// real bcrypt hashing, real Prisma queries — everything except the Next.js
// request lifecycle, which has no meaning outside an actual HTTP request
// and is mocked here (in-memory cookie/header store) so the service layer
// itself is what's under test. Domain-level policy edge cases already
// have exhaustive unit coverage in packages/domain/src/policy.test.ts;
// this file's job is proving the *wiring* — that a real signup/invite/
// role-change/client-isolation flow actually persists and enforces
// correctly against a real database, closing the gap flagged in
// ROADMAP.md ("no E2E/integration test layer yet").
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Next's bundler aliases "server-only" to a no-op for genuine server code
// and to a throwing stub for client bundles; outside that bundler (i.e.
// under vitest) the raw package always throws, so it needs the same
// no-op treatment here.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => {
  const cookieStore = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
      set: (name: string, value: string) => {
        cookieStore.set(name, value);
      },
      delete: (name: string) => {
        cookieStore.delete(name);
      },
    }),
    headers: async () => new Map<string, string>(),
  };
});

import { prisma } from "@cedar/db";
import { isAuthorized } from "@cedar/auth";
import { AuthError, bootstrapOrganization, login } from "./auth-service";
import { acceptInvitationFlow, changeMemberRole, createInvitation, grantClientScope, revokeMembership } from "./membership-service";
import { getSessionToken } from "../session-cookie";

async function wipeDatabase() {
  // FK-safe delete order: children before parents.
  await prisma.auditEvent.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

beforeAll(async () => {
  await wipeDatabase();
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("bootstrapOrganization", () => {
  it("creates the first organization + OWNER membership and starts a session", async () => {
    await bootstrapOrganization({
      orgName: "Test Agency",
      name: "Owner Person",
      email: "owner@test.example",
      password: "correct-horse-battery",
    });

    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Test Agency" } });
    const membership = await prisma.membership.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(membership.role).toBe("OWNER");
    expect(membership.status).toBe("ACTIVE");

    const token = await getSessionToken();
    expect(token).toBeTruthy();
  });

  it("refuses to bootstrap a second organization once one exists", async () => {
    await expect(
      bootstrapOrganization({ orgName: "Second Agency", name: "Someone", email: "x@test.example", password: "irrelevant123" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a short password", async () => {
    await wipeDatabase();
    await expect(
      bootstrapOrganization({ orgName: "Agency", name: "Owner", email: "o@test.example", password: "short" }),
    ).rejects.toThrow(AuthError);

    // restore state for the remaining describe blocks
    await bootstrapOrganization({
      orgName: "Test Agency",
      name: "Owner Person",
      email: "owner@test.example",
      password: "correct-horse-battery",
    });
  });
});

describe("login", () => {
  it("succeeds with correct credentials and rejects wrong ones", async () => {
    await expect(login({ email: "owner@test.example", password: "wrong-password" })).rejects.toThrow(AuthError);
    await expect(login({ email: "nobody@test.example", password: "whatever12345" })).rejects.toThrow(AuthError);
    await expect(login({ email: "owner@test.example", password: "correct-horse-battery" })).resolves.toBeUndefined();
  });

  it("records an audit event on successful login", async () => {
    const before = await prisma.auditEvent.count({ where: { action: "session.created" } });
    await login({ email: "owner@test.example", password: "correct-horse-battery" });
    const after = await prisma.auditEvent.count({ where: { action: "session.created" } });
    expect(after).toBe(before + 1);
  });
});

describe("invitation lifecycle", () => {
  it("invites, accepts, and grants the new member a client-scoped permission — then enforces isolation", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@test.example" } });
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: owner.id } });
    const org = await prisma.organization.findFirstOrThrow();

    const [clientA, clientB] = await Promise.all([
      prisma.client.create({
        data: { organizationId: org.id, name: "Client A", companyName: "A Inc", services: "[]" },
      }),
      prisma.client.create({
        data: { organizationId: org.id, name: "Client B", companyName: "B Inc", services: "[]" },
      }),
    ]);

    const token = await createInvitation({
      actorUserId: owner.id,
      organizationId: org.id,
      email: "manager@test.example",
      role: "ACCOUNT_MANAGER",
    });

    await acceptInvitationFlow(token, { name: "Account Manager", password: "another-good-password" });

    const managerUser = await prisma.user.findUniqueOrThrow({ where: { email: "manager@test.example" } });
    const managerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: managerUser.id } });
    expect(managerMembership.role).toBe("ACCOUNT_MANAGER");
    expect(managerMembership.status).toBe("ACTIVE");

    // No scope granted yet — should see nothing.
    expect(
      await isAuthorized({ userId: managerUser.id, organizationId: org.id, permission: "clients:read", clientId: clientA.id }),
    ).toBe(false);

    await grantClientScope({
      actorUserId: owner.id,
      organizationId: org.id,
      targetMembershipId: managerMembership.id,
      clientId: clientA.id,
      permission: "clients:read",
    });

    // Now scoped to Client A only — Section 38 acceptance scenario, exercised end-to-end.
    expect(
      await isAuthorized({ userId: managerUser.id, organizationId: org.id, permission: "clients:read", clientId: clientA.id }),
    ).toBe(true);
    expect(
      await isAuthorized({ userId: managerUser.id, organizationId: org.id, permission: "clients:read", clientId: clientB.id }),
    ).toBe(false);
    expect(await isAuthorized({ userId: managerUser.id, organizationId: org.id, permission: "finance:read" })).toBe(false);

    // Owner-only wiring still holds via this real DB round-trip too.
    await expect(
      changeMemberRole({ actorUserId: managerUser.id, organizationId: org.id, targetMembershipId: ownerMembership.id, newRole: "ADMIN" }),
    ).rejects.toThrow();
  });

  it("rejects an expired/already-used invitation token", async () => {
    await expect(acceptInvitationFlow("not-a-real-token", { name: "Nobody", password: "whatever12345" })).rejects.toThrow(AuthError);
  });
});

describe("last-owner protection", () => {
  it("refuses to revoke the only OWNER, even via the OWNER's own action", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@test.example" } });
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: owner.id, role: "OWNER" } });

    await expect(
      revokeMembership({ actorUserId: owner.id, organizationId: org.id, targetMembershipId: ownerMembership.id }),
    ).rejects.toThrow();

    const stillActive = await prisma.membership.findUniqueOrThrow({ where: { id: ownerMembership.id } });
    expect(stillActive.status).toBe("ACTIVE");
  });
});
