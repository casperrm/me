// Integration test for the Cedar Decision Engine v1 (Bible Section 20).
// No server-only/next-headers mocks needed — decision-engine-service.ts
// is a pure Prisma query module, same shape as opportunity-service.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { getClientRenewalRecommendation, getHiringCapacityRecommendation } from "./decision-engine-service";

async function wipeDatabase() {
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.clientHealthScore.deleteMany();
  await prisma.client.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
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

// Each test below uses its own isolated organization — capacityByMember
// and activeMemberCount are org-wide aggregates, so sharing `orgId` across
// tests (as the describe block above does) would let one test's fixture
// members skew another's strained-ratio math.
async function createOrgWithMember(orgName: string, memberName: string) {
  const org = await prisma.organization.create({ data: { name: orgName } });
  const user = await prisma.user.create({ data: { email: `${orgName.toLowerCase().replace(/\s+/g, "-")}@test.example`, name: memberName, passwordHash: "irrelevant" } });
  const membership = await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "DESIGNER", status: "ACTIVE" } });
  return { orgId: org.id, membershipId: membership.id };
}

async function createOpenTasks(clientOrgId: string, membershipId: string, count: number) {
  const client = await prisma.client.create({ data: { organizationId: clientOrgId, name: "Capacity Client", companyName: "Inc", services: "[]" } });
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Capacity Project" } });
  for (let i = 0; i < count; i++) {
    await prisma.task.create({ data: { projectId: project.id, title: `Task ${i}`, status: "todo", assigneeId: membershipId } });
  }
}

describe("getHiringCapacityRecommendation", () => {
  it("recommends no_action_needed when no active team member is strained", async () => {
    const { orgId: capOrgId } = await createOrgWithMember("Idle Capacity Org", "Idle Member");

    const result = await getHiringCapacityRecommendation(capOrgId);

    expect(result.recommendation).toBe("no_action_needed");
    expect(result.risks).toHaveLength(0);
    expect(result.evidence.some((e) => e.includes("0 of 1 active team member"))).toBe(true);
    expect(result.evidence.some((e) => e.startsWith("Service demand:"))).toBe(true);
  });

  it("recommends monitor when fewer than half of active members are strained", async () => {
    const { orgId: capOrgId, membershipId } = await createOrgWithMember("Monitor Capacity Org", "Strained Member");
    // Two more active members in the SAME org, both with no tasks.
    const fine1 = await prisma.user.create({ data: { email: "monitor-fine-1@test.example", name: "Fine One", passwordHash: "irrelevant" } });
    await prisma.membership.create({ data: { organizationId: capOrgId, userId: fine1.id, role: "DESIGNER", status: "ACTIVE" } });
    const fine2 = await prisma.user.create({ data: { email: "monitor-fine-2@test.example", name: "Fine Two", passwordHash: "irrelevant" } });
    await prisma.membership.create({ data: { organizationId: capOrgId, userId: fine2.id, role: "DESIGNER", status: "ACTIVE" } });

    await createOpenTasks(capOrgId, membershipId, 5); // meets CAPACITY_OPEN_TASK_THRESHOLD

    const result = await getHiringCapacityRecommendation(capOrgId);

    expect(result.recommendation).toBe("monitor");
    expect(result.risks.some((r) => r.includes("Strained Member"))).toBe(true);
    expect(result.evidence.some((e) => e.includes("1 of 3 active team member"))).toBe(true);
  });

  it("recommends hire when at least half of active members are strained", async () => {
    const { orgId: capOrgId, membershipId: memberA } = await createOrgWithMember("Hire Capacity Org", "Strained A");
    const userB = await prisma.user.create({ data: { email: "hire-strained-b@test.example", name: "Strained B", passwordHash: "irrelevant" } });
    const memberBRow = await prisma.membership.create({ data: { organizationId: capOrgId, userId: userB.id, role: "DESIGNER", status: "ACTIVE" } });

    await createOpenTasks(capOrgId, memberA, 5);
    await createOpenTasks(capOrgId, memberBRow.id, 5);

    const result = await getHiringCapacityRecommendation(capOrgId);

    expect(result.recommendation).toBe("hire");
    expect(result.risks).toHaveLength(2);
    expect(result.evidence.some((e) => e.includes("2 of 2 active team member"))).toBe(true);
  });

  it("always requires human approval and states real, non-fabricated assumptions", async () => {
    const { orgId: capOrgId } = await createOrgWithMember("Approval Check Capacity Org", "Solo Member");

    const result = await getHiringCapacityRecommendation(capOrgId);

    expect(result.requiresApproval).toBe(true);
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("no pipeline/lead-stage data"))).toBe(true);
  });
});
