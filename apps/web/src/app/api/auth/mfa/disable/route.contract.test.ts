// API-contract test for POST /api/auth/mfa/disable. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { authenticator } from "otplib";
import { hashPassword } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { startMfaEnrollment, confirmMfaEnrollment } from "@/lib/services/mfa-service";
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
  const org = await prisma.organization.create({ data: { name: "MFA Disable Route Test Agency" } });
  orgId = org.id;
  const user = await prisma.user.create({
    data: { email: "mfa-disable-route@test.example", name: "Owner", passwordHash: await hashPassword("correct-horse-battery") },
  });
  userId = user.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });

  const enrollment = await startMfaEnrollment(userId);
  await confirmMfaEnrollment(userId, authenticator.generate(enrollment.secret));
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/mfa/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/mfa/disable", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ password: "correct-horse-battery" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when password is missing from the body", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 with the real service's message for the wrong password, and leaves MFA enabled", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST(request({ password: "wrong-password" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/incorrect password/i);

    const stored = await prisma.user.findUnique({ where: { id: userId } });
    expect(stored?.mfaEnabled).toBe(true);
  });

  it("returns 200 for the correct password, and actually disables MFA and clears recovery codes", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST(request({ password: "correct-horse-battery" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.user.findUnique({ where: { id: userId } });
    expect(stored?.mfaEnabled).toBe(false);
    expect(stored?.mfaSecretEncrypted).toBeNull();
    const recoveryCodeCount = await prisma.mfaRecoveryCode.count({ where: { userId } });
    expect(recoveryCodeCount).toBe(0);
  });
});
