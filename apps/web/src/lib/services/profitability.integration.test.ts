// Integration test for profitability attribution (Bible Section 4.2/16).
// See identity.integration.test.ts for why next/headers and server-only
// are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { createExpense } from "./expense-service";
import { getClientProfitability } from "./profitability-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientAId: string;
let clientBId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Profitability Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "profit-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { organizationId: org.id, name: "Profitable Client", companyName: "A Inc", services: "[]" } }),
    prisma.client.create({ data: { organizationId: org.id, name: "Break-even Client", companyName: "B Inc", services: "[]" } }),
  ]);
  clientAId = clientA.id;
  clientBId = clientB.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createExpense", () => {
  it("rejects a non-positive amount and a missing category", async () => {
    await expect(
      createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "", amountCents: 100 }),
    ).rejects.toThrow(AuthError);
    await expect(
      createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Software", amountCents: 0 }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a client from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    await expect(
      createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Software", amountCents: 5000, clientId: otherClient.id }),
    ).rejects.toThrow(AuthError);
  });

  it("creates an expense attributed to a client, and one with no client (overhead)", async () => {
    const attributed = await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "Contractor",
      amountCents: 20000,
      clientId: clientAId,
    });
    expect(attributed.clientId).toBe(clientAId);

    const overhead = await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "Software",
      amountCents: 5000,
    });
    expect(overhead.clientId).toBeNull();
  });
});

describe("getClientProfitability", () => {
  it("computes revenue only from PAID invoices, cost from attributed expenses, and reports unattributed overhead separately", async () => {
    await prisma.invoice.create({ data: { clientId: clientAId, amountCents: 100000, status: "PAID" } });
    await prisma.invoice.create({ data: { clientId: clientAId, amountCents: 999999, status: "SENT" } }); // unpaid — must not count

    const { clients, unattributedCostCents } = await getClientProfitability(orgId);

    const clientA = clients.find((c) => c.clientId === clientAId)!;
    expect(clientA.revenueCents).toBe(100000);
    expect(clientA.costCents).toBe(20000); // from the previous describe block's "Contractor" expense
    expect(clientA.profitCents).toBe(80000);
    expect(clientA.marginPct).toBeCloseTo(80);

    const clientB = clients.find((c) => c.clientId === clientBId)!;
    expect(clientB.revenueCents).toBe(0);
    expect(clientB.costCents).toBe(0);
    expect(clientB.marginPct).toBeNull();

    expect(unattributedCostCents).toBe(5000); // the "Software" overhead expense
  });

  it("never lets one client's expenses leak into another client's cost", async () => {
    await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Ads spend", amountCents: 30000, clientId: clientBId });

    const { clients } = await getClientProfitability(orgId);
    const clientA = clients.find((c) => c.clientId === clientAId)!;
    const clientB = clients.find((c) => c.clientId === clientBId)!;

    expect(clientA.costCents).toBe(20000);
    expect(clientB.costCents).toBe(30000);
  });
});
