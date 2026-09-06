// Integration test for the AI Business Advisor's deterministic data layer
// (Bible Section 16.2). No server-only/next-headers mocks needed —
// business-advisor-service.ts has no session/cookie dependency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { getBusinessAdvisorBriefing } from "./business-advisor-service";

async function wipeDatabase() {
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let clientAId: string;
let clientBId: string;
let clientCId: string;
let overloadedMembershipId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Advisor Test Agency" } });
  orgId = org.id;

  // Client A: profitable, offers "social".
  const clientA = await prisma.client.create({
    data: { organizationId: orgId, name: "Client A", companyName: "A Inc", services: JSON.stringify(["social"]) },
  });
  clientAId = clientA.id;
  await prisma.invoice.create({ data: { clientId: clientAId, amountCents: 10000, status: "PAID" } });

  // Client B: unprofitable, offers "social" and "video" — expenses exceed revenue.
  const clientB = await prisma.client.create({
    data: { organizationId: orgId, name: "Client B", companyName: "B Inc", services: JSON.stringify(["social", "video"]) },
  });
  clientBId = clientB.id;
  await prisma.invoice.create({ data: { clientId: clientBId, amountCents: 5000, status: "PAID" } });
  await prisma.expense.create({ data: { organizationId: orgId, clientId: clientBId, category: "Software", amountCents: 20000 } });

  // Org-wide overhead expense, unattributed.
  await prisma.expense.create({ data: { organizationId: orgId, category: "Contractor", amountCents: 5000 } });

  // Client C: zero revenue/cost, offers only "seo" — a gap target for the
  // upsell rollup (both A and B have "social", C doesn't).
  const clientC = await prisma.client.create({
    data: { organizationId: orgId, name: "Client C", companyName: "C Inc", services: JSON.stringify(["seo"]) },
  });
  clientCId = clientC.id;
  // Overdue unpaid invoice — a collection risk.
  await prisma.invoice.create({
    data: { clientId: clientCId, amountCents: 3000, status: "SENT", dueAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });

  // Team capacity: one overloaded member, one fine.
  const overloadedUser = await prisma.user.create({
    data: { email: "overloaded@test.example", name: "Overloaded Person", passwordHash: "irrelevant" },
  });
  const overloadedMembership = await prisma.membership.create({
    data: { organizationId: orgId, userId: overloadedUser.id, role: "ACCOUNT_MANAGER", status: "ACTIVE" },
  });
  overloadedMembershipId = overloadedMembership.id;

  const fineUser = await prisma.user.create({
    data: { email: "fine@test.example", name: "Fine Person", passwordHash: "irrelevant" },
  });
  const fineMembership = await prisma.membership.create({
    data: { organizationId: orgId, userId: fineUser.id, role: "ACCOUNT_MANAGER", status: "ACTIVE" },
  });

  const project = await prisma.project.create({ data: { clientId: clientAId, name: "Capacity Project" } });
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  for (let i = 0; i < 4; i++) {
    await prisma.task.create({
      data: { projectId: project.id, title: `Overdue task ${i}`, assigneeId: overloadedMembershipId, status: "todo", dueDate: past },
    });
  }
  for (let i = 0; i < 2; i++) {
    await prisma.task.create({
      data: { projectId: project.id, title: `Future task ${i}`, assigneeId: overloadedMembershipId, status: "todo", dueDate: future },
    });
  }
  await prisma.task.create({
    data: { projectId: project.id, title: "Fine task", assigneeId: fineMembership.id, status: "todo", dueDate: future },
  });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("getBusinessAdvisorBriefing", () => {
  it("identifies the unprofitable engagement with its real profit/margin", async () => {
    const briefing = await getBusinessAdvisorBriefing(orgId);
    expect(briefing.unprofitableEngagements).toHaveLength(1);
    expect(briefing.unprofitableEngagements[0].clientId).toBe(clientBId);
    expect(briefing.unprofitableEngagements[0].profitCents).toBe(5000 - 20000);
  });

  it("ranks cost leakage by category share of total spend", async () => {
    const briefing = await getBusinessAdvisorBriefing(orgId);
    expect(briefing.costLeakage[0]).toMatchObject({ category: "Software", amountCents: 20000, shareOfTotalPct: 80 });
    expect(briefing.costLeakage[1]).toMatchObject({ category: "Contractor", amountCents: 5000, shareOfTotalPct: 20 });
  });

  it("surfaces a strong service only when 2+ clients have it, counting only the profitable ones", async () => {
    const briefing = await getBusinessAdvisorBriefing(orgId);
    const social = briefing.strongServices.find((s) => s.service === "social");
    expect(social).toEqual({ service: "social", profitableClientCount: 1, totalClientCount: 2 });

    // "video" and "seo" each only appear for one client — below the evidence threshold.
    expect(briefing.strongServices.some((s) => s.service === "video")).toBe(false);
    expect(briefing.strongServices.some((s) => s.service === "seo")).toBe(false);
  });

  it("flags the overloaded team member but not the one with a light load", async () => {
    const briefing = await getBusinessAdvisorBriefing(orgId);
    expect(briefing.capacityRisks).toHaveLength(1);
    expect(briefing.capacityRisks[0]).toMatchObject({
      membershipId: overloadedMembershipId,
      memberName: "Overloaded Person",
      openTaskCount: 6,
      overdueTaskCount: 4,
    });
  });

  it("reports the overdue unpaid invoice as a collection risk, excluding paid invoices", async () => {
    const briefing = await getBusinessAdvisorBriefing(orgId);
    expect(briefing.collectionRisks).toHaveLength(1);
    expect(briefing.collectionRisks[0]).toMatchObject({
      clientId: clientCId,
      clientName: "Client C",
      overdueInvoiceCount: 1,
      overdueAmountCents: 3000,
    });
  });

  it("rolls up the one real cross-client upsell gap", async () => {
    const briefing = await getBusinessAdvisorBriefing(orgId);
    expect(briefing.upsellRollup).toEqual([{ type: "service_gap", label: "social", clientCount: 1 }]);
  });
});
