// API-contract test for PATCH/DELETE /api/expenses/[id]. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the sibling
// POST route's pattern this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { DELETE, PATCH } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Edit Expense Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "edit-expense-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "edit-expense-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/expenses/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("http://localhost/api/expenses/x", { method: "DELETE" });
}

describe("PATCH /api/expenses/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    const expense = await prisma.expense.create({ data: { organizationId: orgId, category: "Software", amountCents: 1000 } });
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await PATCH(patchRequest({ category: "New" }), { params: Promise.resolve({ id: expense.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without finance:write", async () => {
    const expense = await prisma.expense.create({ data: { organizationId: orgId, category: "Software", amountCents: 1000 } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({ category: "Hijacked" }), { params: Promise.resolve({ id: expense.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists the change", async () => {
    const expense = await prisma.expense.create({ data: { organizationId: orgId, category: "Software", amountCents: 1000 } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({ category: "Software Licenses", amountCents: 2500 }), { params: Promise.resolve({ id: expense.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, expenseId: expense.id });

    const stored = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(stored).toMatchObject({ category: "Software Licenses", amountCents: 2500 });
  });

  it("returns 400 for a non-positive amount", async () => {
    const expense = await prisma.expense.create({ data: { organizationId: orgId, category: "Software", amountCents: 1000 } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({ amountCents: 0 }), { params: Promise.resolve({ id: expense.id }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an expense in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Expense Edit Org" } });
    const otherExpense = await prisma.expense.create({ data: { organizationId: otherOrg.id, category: "Other", amountCents: 100 } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await PATCH(patchRequest({ category: "Hijacked" }), { params: Promise.resolve({ id: otherExpense.id }) });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/expenses/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    const expense = await prisma.expense.create({ data: { organizationId: orgId, category: "Software", amountCents: 1000 } });
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: expense.id }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without finance:write", async () => {
    const expense = await prisma.expense.create({ data: { organizationId: orgId, category: "Software", amountCents: 1000 } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: expense.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually deletes the row", async () => {
    const expense = await prisma.expense.create({ data: { organizationId: orgId, category: "Software", amountCents: 1000 } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: expense.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(stored).toBeNull();
  });

  it("returns 400 for an expense in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Expense Delete Org" } });
    const otherExpense = await prisma.expense.create({ data: { organizationId: otherOrg.id, category: "Other", amountCents: 100 } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: otherExpense.id }) });
    expect(res.status).toBe(400);
  });
});
