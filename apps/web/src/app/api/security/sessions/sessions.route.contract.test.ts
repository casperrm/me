// API-contract test for the three session-management routes (Bible
// Section 23.1 "device/session revocation"): GET (list), DELETE [id]
// (revoke one), POST revoke-all (revoke every other session). See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { createSession } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { GET as listRoute } from "./route";
import { DELETE as deleteRoute } from "./[id]/route";
import { POST as revokeAllRoute } from "./revoke-all/route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let userId: string;
let membershipId: string;
let currentSessionId: string;

function actor() {
  return { user: { id: userId }, organizationId: orgId, membership: { id: membershipId }, session: { id: currentSessionId } };
}

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Session Route Test Agency" } });
  orgId = org.id;
  const user = await prisma.user.create({
    data: { email: "session-route@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  userId = user.id;
  const membership = await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });
  membershipId = membership.id;

  const { session } = await createSession(userId, { ipAddress: "127.0.0.1", userAgent: "Current Device" });
  currentSessionId = session.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("GET /api/security/sessions", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await listRoute();
    expect(res.status).toBe(401);
  });

  it("returns the real active sessions, flagging the current one", async () => {
    const { session: other } = await createSession(userId, { ipAddress: "10.0.0.9", userAgent: "Other Device" });
    getCurrentActor.mockResolvedValueOnce(actor());
    const res = await listRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain(currentSessionId);
    expect(ids).toContain(other.id);
    const current = body.sessions.find((s: { id: string }) => s.id === currentSessionId);
    expect(current.isCurrent).toBe(true);
    const otherRow = body.sessions.find((s: { id: string }) => s.id === other.id);
    expect(otherRow.isCurrent).toBe(false);

    await prisma.session.delete({ where: { id: other.id } });
  });
});

describe("DELETE /api/security/sessions/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await deleteRoute(new Request("http://localhost/x"), { params: Promise.resolve({ id: "does-not-matter" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a session belonging to a different user", async () => {
    const otherUser = await prisma.user.create({ data: { email: "session-route-victim@test.example", name: "Victim", passwordHash: "irrelevant" } });
    const { session: victimSession } = await createSession(otherUser.id, {});

    getCurrentActor.mockResolvedValueOnce(actor());
    const res = await deleteRoute(new Request("http://localhost/x"), { params: Promise.resolve({ id: victimSession.id }) });
    expect(res.status).toBe(404);

    const reloaded = await prisma.session.findUniqueOrThrow({ where: { id: victimSession.id } });
    expect(reloaded.revokedAt).toBeNull();

    await prisma.session.delete({ where: { id: victimSession.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });

  it("returns 200 and actually revokes the caller's own session", async () => {
    const { session } = await createSession(userId, {});
    getCurrentActor.mockResolvedValueOnce(actor());
    const res = await deleteRoute(new Request("http://localhost/x"), { params: Promise.resolve({ id: session.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const reloaded = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.revokedAt).not.toBeNull();
  });
});

describe("POST /api/security/sessions/revoke-all", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await revokeAllRoute();
    expect(res.status).toBe(401);
  });

  it("returns 200 and revokes every other session, leaving the current one active", async () => {
    await createSession(userId, {});
    await createSession(userId, {});

    getCurrentActor.mockResolvedValueOnce(actor());
    const res = await revokeAllRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.revokedCount).toBeGreaterThanOrEqual(2);

    const current = await prisma.session.findUniqueOrThrow({ where: { id: currentSessionId } });
    expect(current.revokedAt).toBeNull();

    const stillActive = await prisma.session.count({ where: { userId, revokedAt: null } });
    expect(stillActive).toBe(1);
  });
});
