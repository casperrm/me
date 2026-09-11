// API-contract test for PATCH /api/clients/[id]. See
// apps/web/src/app/api/clients/route.contract.test.ts for the sibling
// POST route's pattern this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { PATCH } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Edit Client Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "edit-client-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "edit-client-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Edit Route Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/clients/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/clients/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await PATCH(request({ name: "New Name" }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await PATCH(request({ name: "Hijacked" }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists the change", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(request({ name: "Edit Route Client (Updated)", lifecycleStage: "PAUSED" }), {
      params: Promise.resolve({ id: clientId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, clientId });

    const stored = await prisma.client.findUnique({ where: { id: clientId } });
    expect(stored).toMatchObject({ name: "Edit Route Client (Updated)", lifecycleStage: "PAUSED" });
  });

  it("returns 400 for an invalid lifecycleStage", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(request({ lifecycleStage: "NOT_REAL" }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a client in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Edit Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(request({ name: "Hijacked" }), { params: Promise.resolve({ id: otherClient.id }) });
    expect(res.status).toBe(400);
  });
});
