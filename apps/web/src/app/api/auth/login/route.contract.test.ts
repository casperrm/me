// API-contract test for POST /api/auth/login — the route handler itself
// (request parsing, error envelope, status codes), not `login()` itself
// (already integration-tested in identity.integration.test.ts). Unlike
// every other route.contract.test.ts in this suite, this route doesn't
// go through @/lib/current-actor at all (it's the thing that creates a
// session in the first place), so it mocks next/headers directly with
// the same in-memory cookie store identity.integration.test.ts uses,
// rather than mocking getCurrentActor.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
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
}));

import { hashPassword, resetRateLimitForTests } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

// Each existing test case below uses its own fake IP so the per-IP rate
// limit bucket (route.ts) doesn't accumulate across unrelated assertions;
// only the dedicated rate-limit test deliberately floods one IP.
const TEST_IPS = {
  missingFields: "10.0.0.1",
  wrongPassword: "10.0.0.2",
  unknownEmail: "10.0.0.3",
  success: "10.0.0.4",
  rateLimited: "10.0.0.9",
};

beforeAll(async () => {
  await wipeDatabase();
  await Promise.all(
    Object.values(TEST_IPS).map((ip) => resetRateLimitForTests(`login:${ip}`)),
  );
  const org = await prisma.organization.create({ data: { name: "Login Route Test Agency" } });
  const user = await prisma.user.create({
    data: { email: "login-route@test.example", name: "Owner", passwordHash: await hashPassword("correct-horse-battery") },
  });
  await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await Promise.all(
    Object.values(TEST_IPS).map((ip) => resetRateLimitForTests(`login:${ip}`)),
  );
  await prisma.$disconnect();
});

function request(body: unknown, ip: string) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("returns 400 when email or password is missing", async () => {
    const res = await POST(request({ email: "login-route@test.example" }, TEST_IPS.missingFields));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 401 with an error envelope for wrong credentials, and doesn't set a session cookie", async () => {
    cookieStore.clear();
    const res = await POST(request({ email: "login-route@test.example", password: "wrong-password" }, TEST_IPS.wrongPassword));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
    expect(cookieStore.size).toBe(0);
  });

  it("returns 401 for an email that doesn't exist, without leaking whether the account exists", async () => {
    const res = await POST(request({ email: "nobody-at-all@test.example", password: "whatever12345" }, TEST_IPS.unknownEmail));
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets a real session cookie on success", async () => {
    cookieStore.clear();
    const res = await POST(request({ email: "login-route@test.example", password: "correct-horse-battery" }, TEST_IPS.success));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(cookieStore.size).toBe(1);

    const sessionCount = await prisma.session.count();
    expect(sessionCount).toBe(1);
  });

  it("returns 429 with a Retry-After header once an IP exceeds the login attempt limit", async () => {
    const ip = TEST_IPS.rateLimited;
    let lastRes: Response | undefined;
    for (let i = 0; i < 11; i++) {
      lastRes = await POST(request({ email: "nobody-at-all@test.example", password: "wrong" }, ip));
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).toEqual(expect.any(String));
    const body = await lastRes!.json();
    expect(body).toEqual({ error: expect.any(String) });
  });
});
