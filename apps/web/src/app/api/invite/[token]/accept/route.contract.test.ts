// API-contract test for POST /api/invite/[token]/accept. Unlike every
// other write route in this suite, this one is deliberately not
// session-gated (there's no account yet) — its contract is entirely
// about the invitation token instead. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this file otherwise follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// acceptInvitationFlow signs the new user in immediately, which sets a
// real session cookie — see identity.integration.test.ts for why
// next/headers needs this in-memory mock outside a real HTTP request.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { createInvitation } from "@/lib/services/membership-service";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Invite Accept Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "invite-accept-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/invite/x/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invite/[token]/accept", () => {
  it("returns 400 when name or password is missing", async () => {
    const res = await POST(request({ name: "New Person" }), { params: Promise.resolve({ token: "irrelevant" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 with the real service's message for an invalid or unknown token", async () => {
    const res = await POST(request({ name: "New Person", password: "a-real-password" }), {
      params: Promise.resolve({ token: "not-a-real-token" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid or has expired/i);
  });

  it("returns 200 and actually creates the user and an ACTIVE membership", async () => {
    const token = await createInvitation({
      actorUserId: ownerUserId,
      organizationId: orgId,
      email: "new-hire@test.example",
      role: "DESIGNER",
    });

    const res = await POST(request({ name: "New Hire", password: "a-real-password" }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const user = await prisma.user.findUnique({ where: { email: "new-hire@test.example" } });
    expect(user).toBeTruthy();
    const membership = await prisma.membership.findFirst({ where: { userId: user!.id, organizationId: orgId } });
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.role).toBe("DESIGNER");
  });

  it("returns 400 when the same token is used a second time", async () => {
    const token = await createInvitation({
      actorUserId: ownerUserId,
      organizationId: orgId,
      email: "one-time-use@test.example",
      role: "DESIGNER",
    });

    const first = await POST(request({ name: "First", password: "a-real-password" }), { params: Promise.resolve({ token }) });
    expect(first.status).toBe(200);

    const second = await POST(request({ name: "Second", password: "a-different-password" }), { params: Promise.resolve({ token }) });
    expect(second.status).toBe(400);
  });
});
