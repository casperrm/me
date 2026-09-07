// API-contract test for POST /api/cedar-brain/[id]/flag. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows. Unlike most write routes in this app, flagging isn't
// clients:write-gated — any active member of the organization can flag
// any request, so the interesting negative case is cross-organization,
// not cross-role.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.cedarBrainRequest.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let requestId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Cedar Brain Flag Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "flag-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const cedarBrainRequest = await prisma.cedarBrainRequest.create({
    data: {
      organizationId: org.id,
      prompt: "Smoke test prompt",
      routedAgents: "[]",
      mode: "stub",
      promptVersion: "v4",
      latencyMs: 10,
      success: true,
    },
  });
  requestId = cedarBrainRequest.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request() {
  return new Request("http://localhost/api/cedar-brain/x/flag", { method: "POST" });
}

describe("POST /api/cedar-brain/[id]/flag", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request(), { params: Promise.resolve({ id: requestId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a request that doesn't exist", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: "not-a-real-request-id" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a request from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherRequest = await prisma.cedarBrainRequest.create({
      data: {
        organizationId: otherOrg.id,
        prompt: "Other org prompt",
        routedAgents: "[]",
        mode: "stub",
        promptVersion: "v4",
        latencyMs: 5,
        success: true,
      },
    });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: otherRequest.id }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 and actually flags the real request", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: requestId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.cedarBrainRequest.findUnique({ where: { id: requestId } });
    expect(stored?.flaggedIncorrect).toBe(true);
    expect(stored?.flaggedAt).not.toBeNull();
    expect(stored?.flaggedByMembershipId).not.toBeNull();
  });
});
