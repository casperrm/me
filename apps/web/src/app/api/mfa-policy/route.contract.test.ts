// API-contract test for POST /api/mfa-policy. See
// apps/web/src/app/api/ai-budget/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "MFA Policy Route Test Agency" } });
  orgId = org.id;
  // Enrolled (mfaEnabled: true) — this file tests the /api/mfa-policy
  // route contract itself (auth gate, status codes, persistence), not
  // the MFA enforcement gate requirePermission now adds on top of every
  // permission check (see packages/auth/src/authorize.integration.test.ts
  // and apps/web/src/app/api/expenses/route.contract.test.ts for that):
  // an unenrolled owner turning the policy on, then genuinely being
  // unable to turn it back off themselves until they enroll, is real,
  // correct new behavior — not something this route-contract test
  // should also have to hold constant while proving the toggle works.
  const owner = await prisma.user.create({
    data: { email: "mfa-policy-route-owner@test.example", name: "Owner", passwordHash: "irrelevant", mfaEnabled: true },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "mfa-policy-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/mfa-policy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mfa-policy", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ required: true }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when required is not a boolean", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ required: "yes" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without organization:manage", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ required: true }));
    expect(res.status).toBe(403);
  });

  it("returns 200 and persists the policy for an owner", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ required: true }));
    expect(res.status).toBe(200);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.mfaRequiredForPrivilegedRoles).toBe(true);
  });

  it("returns 200 and turns the policy back off", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ required: false }));
    expect(res.status).toBe(200);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.mfaRequiredForPrivilegedRoles).toBe(false);
  });
});
