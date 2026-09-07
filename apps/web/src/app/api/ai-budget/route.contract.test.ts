// API-contract test for POST /api/ai-budget. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.notification.deleteMany();
  await prisma.aiBudget.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "AI Budget Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "budget-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "budget-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/ai-budget", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai-budget", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ monthlyTokenLimit: 1000 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when monthlyTokenLimit is not a number or null", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ monthlyTokenLimit: "a lot" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without organization:manage", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ monthlyTokenLimit: 1000 }));
    expect(res.status).toBe(403);
  });

  it("returns 400 with the real service's validation for a non-positive limit", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ monthlyTokenLimit: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 200 and persists a real AiBudget row for an owner", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ monthlyTokenLimit: 5000 }));
    expect(res.status).toBe(200);

    const budget = await prisma.aiBudget.findUnique({ where: { organizationId: orgId } });
    expect(budget?.monthlyTokenLimit).toBe(5000);
  });

  it("returns 200 and removes the budget when set to null", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ monthlyTokenLimit: null }));
    expect(res.status).toBe(200);

    const budget = await prisma.aiBudget.findUnique({ where: { organizationId: orgId } });
    expect(budget).toBeNull();
  });
});
