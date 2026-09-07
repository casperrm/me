// API-contract test for POST /api/content/[itemId]/status. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;
let itemId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Content Status Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "content-status-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "content-status-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Content Status Client", companyName: "Inc", services: "[]" },
  });
  clientId = client.id;

  const item = await prisma.contentCalendarItem.create({
    data: { clientId: client.id, channel: "instagram", title: "Route Test Item", status: "BRIEF" },
  });
  itemId = item.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/content/x/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/content/[itemId]/status", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ status: "DRAFT" }), { params: Promise.resolve({ itemId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when status is missing from the body", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}), { params: Promise.resolve({ itemId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ status: "DRAFT" }), { params: Promise.resolve({ itemId }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid status transition, with the real service's message", async () => {
    // BRIEF can only move to DRAFT, not straight to SCHEDULED.
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ status: "SCHEDULED" }), { params: Promise.resolve({ itemId }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot move/i);
  });

  it("returns 200 and actually persists a valid transition", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ status: "DRAFT" }), { params: Promise.resolve({ itemId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.contentCalendarItem.findUnique({ where: { id: itemId } });
    expect(stored?.status).toBe("DRAFT");
  });

  it("returns 400 for an item from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherItem = await prisma.contentCalendarItem.create({
      data: { clientId: otherClient.id, channel: "tiktok", title: "Other Org Item", status: "BRIEF" },
    });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ status: "DRAFT" }), { params: Promise.resolve({ itemId: otherItem.id }) });
    expect(res.status).toBe(400);
  });
});
