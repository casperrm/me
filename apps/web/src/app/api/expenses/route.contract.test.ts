// API-contract test for POST /api/expenses — the route handler itself
// (auth gate, request parsing, error envelope, status codes), not the
// service function underneath (already covered by
// profitability.integration.test.ts). This is the pattern every
// route.contract.test.ts in this suite follows: mock @/lib/current-actor
// to control who's "signed in" per test, but let the real service layer
// hit real Postgres — see docs/specs/api-route-contracts.md.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Route Contract Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Expense Route Test Client", companyName: "Inc", services: "[]" },
  });
  clientId = client.id;
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Expense Route Test Project" } });
  projectId = project.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/expenses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/expenses", () => {
  it("returns 401 with an error envelope when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ category: "Software", amountCents: 1000 }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 400 with an error envelope when required fields are missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ amountCents: 1000 })); // no category
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 400 with the real service's validation message for a non-positive amount", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ category: "Software", amountCents: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive/i);
  });

  it("returns 200 with the real created expense id, and actually persists it", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ category: "Software", amountCents: 5000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, expenseId: expect.any(String) });

    const stored = await prisma.expense.findUnique({ where: { id: body.expenseId } });
    expect(stored).toMatchObject({ category: "Software", amountCents: 5000, organizationId: orgId });
  });

  it("persists a projectId when given alongside its client, and rejects a project with no clientId", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ category: "Contractor", amountCents: 7500, clientId, projectId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const stored = await prisma.expense.findUnique({ where: { id: body.expenseId } });
    expect(stored?.projectId).toBe(projectId);

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const rejected = await POST(request({ category: "Contractor", amountCents: 7500, projectId }));
    expect(rejected.status).toBe(400);
  });
});
