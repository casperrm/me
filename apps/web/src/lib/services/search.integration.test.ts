// Integration test for global search (Bible Section 28.2). No
// server-only/next-headers mocks needed — search-service.ts is a pure
// Prisma query module with no session/cookie dependency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { searchRecords } from "./search-service";

async function wipeDatabase() {
  await prisma.shoot.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let clientAId: string;
let clientBId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Search Test Agency" } });
  orgId = org.id;

  const clientA = await prisma.client.create({
    data: { organizationId: org.id, name: "Voltage Motors", companyName: "Voltage Motors Inc", services: "[]" },
  });
  clientAId = clientA.id;
  const clientB = await prisma.client.create({
    data: { organizationId: org.id, name: "Bright Bakery", companyName: "Bright Bakery LLC", services: "[]" },
  });
  clientBId = clientB.id;

  const projectA = await prisma.project.create({ data: { clientId: clientAId, name: "Voltage Launch Campaign" } });
  await prisma.project.create({ data: { clientId: clientBId, name: "Bakery Grand Opening" } });

  const campaign = await prisma.campaign.create({ data: { projectId: projectA.id, name: "Voltage Spring Push" } });
  await prisma.creative.create({ data: { campaignId: campaign.id, type: "video", platform: "tiktok" } });

  await prisma.contentCalendarItem.create({
    data: { clientId: clientAId, title: "Voltage teaser post", channel: "instagram" },
  });
  await prisma.shoot.create({ data: { clientId: clientAId, title: "Voltage product shoot" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("searchRecords", () => {
  it("returns nothing for a query shorter than 2 characters", async () => {
    const results = await searchRecords({ organizationId: orgId, query: "v" });
    expect(results).toHaveLength(0);
  });

  it("finds matches across clients, projects, campaigns, creatives, content, and shoots", async () => {
    const results = await searchRecords({ organizationId: orgId, query: "voltage" });
    const types = results.map((r) => r.type).sort();
    expect(types).toEqual(["campaign", "client", "content", "project", "shoot"]);
  });

  it("is case-insensitive", async () => {
    const results = await searchRecords({ organizationId: orgId, query: "VOLTAGE" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("matches on creative type/platform text", async () => {
    const results = await searchRecords({ organizationId: orgId, query: "tiktok" });
    expect(results.some((r) => r.type === "creative")).toBe(true);
  });

  it("scopes results to the given clientIds — Section 38 isolation", async () => {
    const scopedToB = await searchRecords({ organizationId: orgId, clientIds: [clientBId], query: "voltage" });
    expect(scopedToB).toHaveLength(0);

    const scopedToA = await searchRecords({ organizationId: orgId, clientIds: [clientAId], query: "voltage" });
    expect(scopedToA.length).toBeGreaterThan(0);
  });

  it("never returns results from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Voltage Impostor", companyName: "Not really", services: "[]" },
    });

    const results = await searchRecords({ organizationId: orgId, query: "voltage" });
    expect(results.every((r) => r.id !== otherClient.id)).toBe(true);
  });
});
