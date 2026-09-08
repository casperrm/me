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
import { createInvoice } from "./invoice-service";
import { getCampaignProfitability, getClientProfitability, getProjectProfitability } from "./profitability-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
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

describe("createExpense project validation", () => {
  it("rejects a projectId with no clientId", async () => {
    const project = await prisma.project.create({ data: { clientId: clientAId, name: "Orphan-check Project" } });
    await expect(
      createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Software", amountCents: 1000, projectId: project.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a projectId that belongs to a different client", async () => {
    const projectOnB = await prisma.project.create({ data: { clientId: clientBId, name: "Client B Project" } });
    await expect(
      createExpense({
        actorUserId: ownerUserId,
        organizationId: orgId,
        category: "Software",
        amountCents: 1000,
        clientId: clientAId,
        projectId: projectOnB.id,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("accepts a projectId that belongs to the given client", async () => {
    const project = await prisma.project.create({ data: { clientId: clientAId, name: "Valid Project" } });
    const expense = await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "Software",
      amountCents: 1000,
      clientId: clientAId,
      projectId: project.id,
    });
    expect(expense.projectId).toBe(project.id);
  });
});

describe("getProjectProfitability", () => {
  it("breaks down revenue/cost/profit by project within a client, with an unassigned bucket", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Project-Scoped Client", companyName: "P Inc", services: "[]" },
    });
    const projectOne = await prisma.project.create({ data: { clientId: client.id, name: "Project One" } });
    const projectTwo = await prisma.project.create({ data: { clientId: client.id, name: "Project Two" } });

    await createInvoice({ actorUserId: ownerUserId, organizationId: orgId, clientId: client.id, projectId: projectOne.id, amountCents: 100000 });
    const paidOnOne = await prisma.invoice.findFirst({ where: { clientId: client.id, projectId: projectOne.id } });
    await prisma.invoice.update({ where: { id: paidOnOne!.id }, data: { status: "PAID" } });

    // Unpaid — must not count as revenue even though it's tagged to project two.
    await createInvoice({ actorUserId: ownerUserId, organizationId: orgId, clientId: client.id, projectId: projectTwo.id, amountCents: 999999 });

    // Invoice with no project — falls into the unassigned bucket.
    await createInvoice({ actorUserId: ownerUserId, organizationId: orgId, clientId: client.id, amountCents: 50000 });
    const unassignedInvoice = await prisma.invoice.findFirst({ where: { clientId: client.id, projectId: null } });
    await prisma.invoice.update({ where: { id: unassignedInvoice!.id }, data: { status: "PAID" } });

    await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Contractor", amountCents: 15000, clientId: client.id, projectId: projectOne.id });
    await createExpense({ actorUserId: ownerUserId, organizationId: orgId, category: "Software", amountCents: 8000, clientId: client.id });

    const { projects, unassignedRevenueCents, unassignedCostCents } = await getProjectProfitability(client.id);

    const one = projects.find((p) => p.projectId === projectOne.id)!;
    expect(one.revenueCents).toBe(100000);
    expect(one.costCents).toBe(15000);
    expect(one.profitCents).toBe(85000);

    const two = projects.find((p) => p.projectId === projectTwo.id)!;
    expect(two.revenueCents).toBe(0); // its only invoice is unpaid
    expect(two.costCents).toBe(0);
    expect(two.marginPct).toBeNull();

    expect(unassignedRevenueCents).toBe(50000);
    expect(unassignedCostCents).toBe(8000);
  });

  it("scopes strictly to the given client's own projects", async () => {
    const { projects } = await getProjectProfitability(clientAId);
    expect(projects.every((p) => p.projectId !== undefined)).toBe(true);
    // clientA's own projects (created in earlier describe blocks) must not
    // include projects created for the "Project-Scoped Client" above.
    const foreignNames = projects.map((p) => p.projectName);
    expect(foreignNames).not.toContain("Project One");
    expect(foreignNames).not.toContain("Project Two");
  });
});

describe("createExpense campaign validation", () => {
  it("rejects a campaignId with no projectId", async () => {
    const project = await prisma.project.create({ data: { clientId: clientAId, name: "Campaign-Check Project" } });
    const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "Orphan-check Campaign" } });
    await expect(
      createExpense({
        actorUserId: ownerUserId,
        organizationId: orgId,
        category: "Ads",
        amountCents: 1000,
        clientId: clientAId,
        campaignId: campaign.id,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a campaignId that belongs to a different project", async () => {
    const projectA = await prisma.project.create({ data: { clientId: clientAId, name: "Campaign Project A" } });
    const projectB = await prisma.project.create({ data: { clientId: clientAId, name: "Campaign Project B" } });
    const campaignOnB = await prisma.campaign.create({ data: { projectId: projectB.id, name: "Campaign On B" } });
    await expect(
      createExpense({
        actorUserId: ownerUserId,
        organizationId: orgId,
        category: "Ads",
        amountCents: 1000,
        clientId: clientAId,
        projectId: projectA.id,
        campaignId: campaignOnB.id,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("accepts a campaignId that belongs to the given project", async () => {
    const project = await prisma.project.create({ data: { clientId: clientAId, name: "Valid Campaign Project" } });
    const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "Valid Campaign" } });
    const expense = await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "Ads",
      amountCents: 1000,
      clientId: clientAId,
      projectId: project.id,
      campaignId: campaign.id,
    });
    expect(expense.campaignId).toBe(campaign.id);
  });
});

describe("getCampaignProfitability", () => {
  it("computes budget vs. actual cost per campaign, with an unassigned bucket for untagged project expenses", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Campaign-Scoped Client", companyName: "C Inc", services: "[]" },
    });
    const project = await prisma.project.create({ data: { clientId: client.id, name: "Campaign-Scoped Project" } });
    const campaignOne = await prisma.campaign.create({
      data: { projectId: project.id, name: "Campaign One", budgetCents: 50000 },
    });
    const campaignTwo = await prisma.campaign.create({
      data: { projectId: project.id, name: "Campaign Two" }, // no budget set
    });

    await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "Ad spend",
      amountCents: 30000,
      clientId: client.id,
      projectId: project.id,
      campaignId: campaignOne.id,
    });
    // Untagged project-level expense — must not count against either
    // campaign, reported separately as unassigned.
    await createExpense({
      actorUserId: ownerUserId,
      organizationId: orgId,
      category: "General",
      amountCents: 4000,
      clientId: client.id,
      projectId: project.id,
    });

    const { campaigns, unassignedCostCents } = await getCampaignProfitability(project.id);

    const one = campaigns.find((c) => c.campaignId === campaignOne.id)!;
    expect(one.budgetCents).toBe(50000);
    expect(one.actualCostCents).toBe(30000);
    expect(one.varianceCents).toBe(20000);

    const two = campaigns.find((c) => c.campaignId === campaignTwo.id)!;
    expect(two.budgetCents).toBeNull();
    expect(two.actualCostCents).toBe(0);
    expect(two.varianceCents).toBeNull();

    expect(unassignedCostCents).toBe(4000);
  });

  it("rejects a campaign-tagged expense when the campaign doesn't belong to the given project", async () => {
    const projectA = await prisma.project.create({ data: { clientId: clientAId, name: "Cross-Project A" } });
    const projectB = await prisma.project.create({ data: { clientId: clientAId, name: "Cross-Project B" } });
    const campaignOnA = await prisma.campaign.create({ data: { projectId: projectA.id, name: "Cross-Project Campaign" } });
    await expect(
      createExpense({
        actorUserId: ownerUserId,
        organizationId: orgId,
        category: "Ads",
        amountCents: 1000,
        clientId: clientAId,
        projectId: projectB.id,
        campaignId: campaignOnA.id,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a campaign-tagged expense from a different organization's campaign", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Campaign Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Campaign Client", companyName: "X", services: "[]" },
    });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Org Project" } });
    const otherCampaign = await prisma.campaign.create({ data: { projectId: otherProject.id, name: "Other Org Campaign" } });

    const ownProject = await prisma.project.create({ data: { clientId: clientAId, name: "Own Org Project" } });
    await expect(
      createExpense({
        actorUserId: ownerUserId,
        organizationId: orgId,
        category: "Ads",
        amountCents: 1000,
        clientId: clientAId,
        projectId: ownProject.id,
        campaignId: otherCampaign.id,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("scopes strictly to the given project's own campaigns", async () => {
    const otherProject = await prisma.project.create({ data: { clientId: clientAId, name: "Unrelated Project" } });
    await prisma.campaign.create({ data: { projectId: otherProject.id, name: "Unrelated Campaign" } });

    const someProject = await prisma.project.create({ data: { clientId: clientAId, name: "Scope-Check Project" } });
    const { campaigns } = await getCampaignProfitability(someProject.id);
    expect(campaigns.map((c) => c.campaignName)).not.toContain("Unrelated Campaign");
  });
});
