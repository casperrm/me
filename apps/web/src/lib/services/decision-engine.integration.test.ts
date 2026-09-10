// Integration test for the Cedar Decision Engine v1 (Bible Section 20).
// No server-only/next-headers mocks needed — decision-engine-service.ts
// is a pure Prisma query module, same shape as opportunity-service.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { getClientRenewalRecommendation } from "./decision-engine-service";

async function wipeDatabase() {
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.clientHealthScore.deleteMany();
  await prisma.client.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Decision Engine Test Agency" } });
  orgId = org.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("getClientRenewalRecommendation", () => {
  it("recommends renew for a healthy, profitable client with no overdue signals", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Healthy Client", companyName: "Healthy Inc", services: "[]" },
    });
    await prisma.clientHealthScore.create({ data: { clientId: client.id, score: 92, factors: "[]" } });
    await prisma.invoice.create({ data: { clientId: client.id, amountCents: 500000, status: "PAID", paidAt: new Date() } });

    const result = await getClientRenewalRecommendation(client.id, orgId);

    expect(result.recommendation).toBe("renew");
    expect(result.risks).toHaveLength(0);
    expect(result.evidence.some((e) => e.includes("92/100"))).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("recommends at_risk for a client with a below-healthy score but no other issues", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Middling Client", companyName: "Middling Inc", services: "[]" },
    });
    await prisma.clientHealthScore.create({ data: { clientId: client.id, score: 60, factors: "[]" } });

    const result = await getClientRenewalRecommendation(client.id, orgId);

    expect(result.recommendation).toBe("at_risk");
    expect(result.risks.some((r) => r.includes("60/100"))).toBe(true);
  });

  it("recommends do_not_renew for a client with a critical health score, unprofitability, and overdue signals combined", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "At-Risk Client", companyName: "At-Risk Inc", services: "[]" },
    });
    await prisma.clientHealthScore.create({ data: { clientId: client.id, score: 35, factors: "[]" } });
    // Unprofitable: expense with no revenue.
    await prisma.expense.create({ data: { organizationId: orgId, clientId: client.id, category: "software", amountCents: 200000 } });
    // Overdue unpaid invoice.
    await prisma.invoice.create({
      data: { clientId: client.id, amountCents: 100000, status: "SENT", dueAt: new Date(Date.now() - 86400000) },
    });
    // Overdue task.
    const project = await prisma.project.create({ data: { clientId: client.id, name: "At-Risk Project" } });
    await prisma.task.create({
      data: { projectId: project.id, title: "Overdue Task", dueDate: new Date(Date.now() - 86400000), status: "todo" },
    });

    const result = await getClientRenewalRecommendation(client.id, orgId);

    expect(result.recommendation).toBe("do_not_renew");
    expect(result.risks.length).toBeGreaterThanOrEqual(3);
    expect(result.risks.some((r) => r.includes("critical"))).toBe(true);
    expect(result.risks.some((r) => r.includes("unprofitable"))).toBe(true);
    expect(result.risks.some((r) => r.includes("overdue unpaid invoice"))).toBe(true);
    expect(result.risks.some((r) => r.includes("overdue task"))).toBe(true);
  });

  it("never fabricates health score or profitability evidence for a client with neither recorded", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "New Client", companyName: "New Inc", services: "[]" },
    });

    const result = await getClientRenewalRecommendation(client.id, orgId);

    expect(result.evidence).toContain("No Client Health Score has been computed yet.");
    expect(result.evidence.some((e) => e.includes("No profitability data recorded"))).toBe(true);
    expect(result.recommendation).toBe("renew"); // no negative signals recorded — nothing to flag as a risk
  });

  it("always requires human approval and never claims to take an automated action", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Approval Check Client", companyName: "Approval Inc", services: "[]" },
    });
    const result = await getClientRenewalRecommendation(client.id, orgId);
    expect(result.requiresApproval).toBe(true);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });
});
