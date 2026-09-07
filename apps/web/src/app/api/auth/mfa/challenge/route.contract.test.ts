// API-contract test for POST /api/auth/mfa/challenge — the second step
// of login for an MFA-enabled account. Unlike every other MFA route,
// this one isn't session-gated (there's no session yet); it's gated by
// the pendingToken issued at the end of the first login step. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this file otherwise follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { authenticator } from "otplib";
import { prisma } from "@cedar/db";
import { startMfaEnrollment, confirmMfaEnrollment } from "@/lib/services/mfa-service";
import { login } from "@/lib/services/auth-service";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.pendingMfaLogin.deleteMany();
  await prisma.mfaRecoveryCode.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let userId: string;
let secret: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "MFA Challenge Route Test Agency" } });
  const user = await prisma.user.create({
    data: { email: "mfa-challenge-route@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  userId = user.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });

  const enrollment = await startMfaEnrollment(userId);
  secret = enrollment.secret;
  await confirmMfaEnrollment(userId, authenticator.generate(secret));

  // Give the user a real password so login() (which needs one) succeeds
  // and issues a real pendingToken.
  const { hashPassword } = await import("@cedar/auth");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword("correct-horse-battery") } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/mfa/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/mfa/challenge", () => {
  it("returns 400 when pendingToken or code is missing", async () => {
    const res = await POST(request({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 with an error envelope for a wrong code", async () => {
    const loginResult = await login({ email: "mfa-challenge-route@test.example", password: "correct-horse-battery" });
    expect(loginResult.mfaRequired).toBe(true);

    const res = await POST(request({ pendingToken: loginResult.pendingToken, code: "000000" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 200 for a real valid code and consumes the pending login", async () => {
    const loginResult = await login({ email: "mfa-challenge-route@test.example", password: "correct-horse-battery" });
    const validToken = authenticator.generate(secret);

    const res = await POST(request({ pendingToken: loginResult.pendingToken, code: validToken }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // The same pendingToken can't be reused.
    const reuse = await POST(request({ pendingToken: loginResult.pendingToken, code: validToken }));
    expect(reuse.status).toBe(401);
  });
});
