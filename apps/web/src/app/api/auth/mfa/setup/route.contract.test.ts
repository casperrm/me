// API-contract test for POST /api/auth/mfa/setup. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.mfaRecoveryCode.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let userId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "MFA Setup Route Test Agency" } });
  orgId = org.id;
  const user = await prisma.user.create({
    data: { email: "mfa-setup-route@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  userId = user.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("POST /api/auth/mfa/setup", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 200 with a real secret and QR code, and persists the pending secret", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.secret).toEqual(expect.any(String));
    expect(body.otpauthUri).toMatch(/^otpauth:\/\//);
    expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const stored = await prisma.user.findUnique({ where: { id: userId } });
    expect(stored?.mfaSecretEncrypted).not.toBeNull();
    expect(stored?.mfaEnabled).toBe(false); // not confirmed yet
  });

  it("returns 400 with the real service's message when MFA is already enabled", async () => {
    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already enabled/i);

    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
  });
});
