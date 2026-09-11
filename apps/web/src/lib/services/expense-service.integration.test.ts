// Integration test for expense editing and deletion (Section 4.2/16)
// against real Postgres. createExpense itself is already covered by
// profitability.integration.test.ts — this covers the missing write half
// that never existed: prisma.expense.update/delete had zero non-test
// call sites anywhere before this slice.
//
// server-only/next-headers mocked — see identity.integration.test.ts for
// why (transitively pulled in via auth-service.ts's AuthError, which
// expense-service.ts imports).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { createExpense, deleteExpense, updateExpense } from "./expense-service";
import { AuthError } from "./auth-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Expense Edit Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "edit-expense-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "edit-expense-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("updateExpense", () => {
  it("updates only the fields provided and records a before/after audit event", async () => {
    const expense = await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Software", amountCents: 5000 });

    const updated = await updateExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      expenseId: expense.id,
      category: "Software Licenses",
      amountCents: 6000,
    });

    expect(updated).toMatchObject({ category: "Software Licenses", amountCents: 6000 });

    const audit = await prisma.auditEvent.findFirst({ where: { action: "expense.updated", resourceId: expense.id } });
    expect(audit).toMatchObject({ resourceType: "Expense", result: "SUCCESS" });
    const changeSet = JSON.parse(audit!.changeSet!) as { before: Record<string, unknown>; after: Record<string, unknown> };
    expect(changeSet.before).toMatchObject({ category: "Software", amountCents: 5000 });
    expect(changeSet.after).toMatchObject({ category: "Software Licenses", amountCents: 6000 });
  });

  it("clears the description to null when given an empty string", async () => {
    const expense = await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "Contractor",
      amountCents: 10000,
      description: "Q1 freelance work",
    });
    const updated = await updateExpense({ actorUserId: ownerUserId, organizationId: orgId, expenseId: expense.id, description: "" });
    expect(updated.description).toBeNull();
  });

  it("does not emit an audit event when nothing actually changed", async () => {
    const expense = await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "No-op", amountCents: 100 });
    await updateExpense({ actorUserId: ownerUserId, organizationId: orgId, expenseId: expense.id, category: "No-op" });
    const auditCount = await prisma.auditEvent.count({ where: { action: "expense.updated", resourceId: expense.id } });
    expect(auditCount).toBe(0);
  });

  it("rejects a non-positive amount", async () => {
    const expense = await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Bad Amount", amountCents: 100 });
    await expect(
      updateExpense({ actorUserId: ownerUserId, organizationId: orgId, expenseId: expense.id, amountCents: 0 }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects when no fields are provided", async () => {
    const expense = await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Empty Update", amountCents: 100 });
    await expect(updateExpense({ actorUserId: ownerUserId, organizationId: orgId, expenseId: expense.id })).rejects.toThrow(AuthError);
  });

  it("rejects a member with no finance:write", async () => {
    const expense = await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Guarded", amountCents: 100 });
    await expect(
      updateExpense({ actorUserId: designerUserId, organizationId: orgId, expenseId: expense.id, category: "Hijacked" }),
    ).rejects.toThrow();
  });

  it("rejects an expense from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Expense Org" } });
    const otherExpense = await prisma.expense.create({ data: { organizationId: otherOrg.id, category: "Other", amountCents: 100 } });

    await expect(
      updateExpense({ actorUserId: ownerUserId, organizationId: orgId, expenseId: otherExpense.id, category: "Hijacked" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("deleteExpense", () => {
  it("deletes a real expense and records a snapshot audit event", async () => {
    const expense = await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "To Delete",
      amountCents: 4200,
      description: "Should be gone",
    });

    const result = await deleteExpense({ actorUserId: ownerUserId, organizationId: orgId, expenseId: expense.id });
    expect(result).toEqual({ id: expense.id });

    const stored = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(stored).toBeNull();

    const audit = await prisma.auditEvent.findFirst({ where: { action: "expense.deleted", resourceId: expense.id } });
    expect(audit).toMatchObject({ resourceType: "Expense", result: "SUCCESS" });
    const changeSet = JSON.parse(audit!.changeSet!) as { category: string; amountCents: number; description: string | null };
    expect(changeSet).toMatchObject({ category: "To Delete", amountCents: 4200, description: "Should be gone" });
  });

  it("rejects a member with no finance:write", async () => {
    const expense = await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Guarded Delete", amountCents: 100 });
    await expect(deleteExpense({ actorUserId: designerUserId, organizationId: orgId, expenseId: expense.id })).rejects.toThrow();
  });

  it("rejects an expense from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Expense Delete Org" } });
    const otherExpense = await prisma.expense.create({ data: { organizationId: otherOrg.id, category: "Other", amountCents: 100 } });

    await expect(deleteExpense({ actorUserId: ownerUserId, organizationId: orgId, expenseId: otherExpense.id })).rejects.toThrow(AuthError);
  });
});
