// API-contract test for POST /api/auth/bootstrap — deliberately not
// session-gated (there's no account yet), and unlike every other route
// in this suite, `bootstrapOrganization` only succeeds when the
// `organizations` table is completely empty (Section 1: the very first
// signup on a fresh deploy). Same next/headers mock as the login route,
// since a successful bootstrap signs the new owner in immediately.
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
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/bootstrap", () => {
  it("returns 400 when a required field is missing", async () => {
    const res = await POST(request({ orgName: "Cedar Point", name: "Owner", email: "owner@test.example" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 400 with the real service's message for a too-short password", async () => {
    const res = await POST(
      request({ orgName: "Cedar Point", name: "Owner", email: "owner@test.example", password: "short" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 8 characters/i);
  });

  it("returns 200 on a truly empty database and actually creates the org, owner, and ACTIVE membership", async () => {
    const res = await POST(
      request({ orgName: "Cedar Point Agency", name: "First Owner", email: "first-owner@test.example", password: "a-real-password" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const org = await prisma.organization.findFirstOrThrow();
    expect(org.name).toBe("Cedar Point Agency");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "first-owner@test.example" } });
    const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id, organizationId: org.id } });
    expect(membership).toMatchObject({ role: "OWNER", status: "ACTIVE" });
  });

  it("returns 400 with the real service's message on a second bootstrap attempt", async () => {
    const res = await POST(
      request({ orgName: "A Second Agency", name: "Someone Else", email: "someone-else@test.example", password: "a-real-password" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);

    // Confirmed no second organization was created despite the request.
    const orgCount = await prisma.organization.count();
    expect(orgCount).toBe(1);
  });
});
