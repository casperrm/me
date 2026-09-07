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

import { hashPassword } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Login Route Test Agency" } });
  const user = await prisma.user.create({
    data: { email: "login-route@test.example", name: "Owner", passwordHash: await hashPassword("correct-horse-battery") },
  });
  await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("returns 400 when email or password is missing", async () => {
    const res = await POST(request({ email: "login-route@test.example" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 401 with an error envelope for wrong credentials, and doesn't set a session cookie", async () => {
    cookieStore.clear();
    const res = await POST(request({ email: "login-route@test.example", password: "wrong-password" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
    expect(cookieStore.size).toBe(0);
  });

  it("returns 401 for an email that doesn't exist, without leaking whether the account exists", async () => {
    const res = await POST(request({ email: "nobody-at-all@test.example", password: "whatever12345" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets a real session cookie on success", async () => {
    cookieStore.clear();
    const res = await POST(request({ email: "login-route@test.example", password: "correct-horse-battery" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(cookieStore.size).toBe(1);

    const sessionCount = await prisma.session.count();
    expect(sessionCount).toBe(1);
  });
});
