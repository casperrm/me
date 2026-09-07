// API-contract test for POST /api/auth/mfa/confirm. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { authenticator } from "otplib";
import { prisma } from "@cedar/db";
import { startMfaEnrollment } from "@/lib/services/mfa-service";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.mfaRecoveryCode.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let userId: string;
let secret: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "MFA Confirm Route Test Agency" } });
  orgId = org.id;
  const user = await prisma.user.create({
    data: { email: "mfa-confirm-route@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  userId = user.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });

  const enrollment = await startMfaEnrollment(userId);
  secret = enrollment.secret;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/mfa/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/mfa/confirm", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ token: "123456" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the token is missing from the body", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 with the real service's message for a wrong code", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST(request({ token: "000000" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/didn't match/i);
  });

  it("returns 200 for a real valid code, and actually enables MFA with real recovery codes", async () => {
    const validToken = authenticator.generate(secret);
    getCurrentActor.mockResolvedValueOnce({ user: { id: userId }, organizationId: orgId });
    const res = await POST(request({ token: validToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.recoveryCodes)).toBe(true);
    expect(body.recoveryCodes.length).toBeGreaterThan(0);

    const stored = await prisma.user.findUnique({ where: { id: userId } });
    expect(stored?.mfaEnabled).toBe(true);
    const recoveryCodeCount = await prisma.mfaRecoveryCode.count({ where: { userId } });
    expect(recoveryCodeCount).toBe(body.recoveryCodes.length);
  });
});
