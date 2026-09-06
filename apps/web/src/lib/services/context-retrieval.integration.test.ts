// Integration test for governed context retrieval (Bible Section 6.1).
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
import { buildGovernedContext } from "./context-retrieval-service";

async function wipeDatabase() {
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.clientHealthScore.deleteMany();
  await prisma.brandProfileVersion.deleteMany();
  await prisma.brandProfile.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let scopedUserId: string;
let clientAId: string;
let clientBId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Context Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "ctx-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const clientA = await prisma.client.create({
    data: { organizationId: org.id, name: "Client A", companyName: "A Inc", services: JSON.stringify(["social"]) },
  });
  clientAId = clientA.id;

  const clientB = await prisma.client.create({
    data: { organizationId: org.id, name: "Client B", companyName: "B Inc", services: "[]" },
  });
  clientBId = clientB.id;

  const brandProfile = await prisma.brandProfile.create({ data: { clientId: clientAId, currentVersion: 1 } });
  await prisma.brandProfileVersion.create({
    data: {
      brandProfileId: brandProfile.id,
      version: 1,
      toneOfVoice: "Confident and energetic",
      targetAudience: "Gen Z EV owners",
      products: JSON.stringify(["FastCharge Pro"]),
    },
  });

  await prisma.clientHealthScore.create({ data: { clientId: clientAId, score: 82, factors: "[]" } });

  await prisma.clientTimelineEvent.create({
    data: { clientId: clientAId, type: "project_created", summary: "Kicked off Q1 campaign." },
  });

  // A scoped member with access ONLY to Client B, not Client A.
  const scoped = await prisma.user.create({
    data: { email: "ctx-scoped@test.example", name: "Scoped Person", passwordHash: "irrelevant" },
  });
  scopedUserId = scoped.id;
  const scopedMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: scoped.id, role: "ACCOUNT_MANAGER", status: "ACTIVE" },
  });
  await prisma.scopedGrant.create({
    data: { membershipId: scopedMembership.id, permission: "clients:read", clientId: clientBId },
  });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("buildGovernedContext", () => {
  it("includes real Brand DNA, health score, and timeline data for an authorized actor", async () => {
    const context = await buildGovernedContext({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId });

    expect(context.text).toContain("Client A");
    expect(context.text).toContain("Confident and energetic");
    expect(context.text).toContain("Gen Z EV owners");
    expect(context.text).toContain("82/100");
    expect(context.text).toContain("Kicked off Q1 campaign.");

    expect(context.sources).toContain("Client record");
    expect(context.sources.some((s) => s.startsWith("Brand DNA"))).toBe(true);
    expect(context.sources.some((s) => s.includes("82/100"))).toBe(true);
    expect(context.sources.some((s) => s.includes("timeline event"))).toBe(true);
  });

  it("omits sections with no real data instead of fabricating placeholders", async () => {
    const context = await buildGovernedContext({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientBId });
    expect(context.text).toContain("Client B");
    expect(context.text).not.toContain("Brand DNA");
    expect(context.sources).toEqual(["Client record"]);
  });

  it("denies retrieval for a client the actor cannot read", async () => {
    await expect(
      buildGovernedContext({ actorUserId: scopedUserId, organizationId: orgId, clientId: clientAId }),
    ).rejects.toThrow(AuthError);
  });

  it("allows retrieval for a client the scoped actor was explicitly granted", async () => {
    const context = await buildGovernedContext({ actorUserId: scopedUserId, organizationId: orgId, clientId: clientBId });
    expect(context.text).toContain("Client B");
  });

  it("rejects a client from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    await expect(
      buildGovernedContext({ actorUserId: ownerUserId, organizationId: orgId, clientId: otherClient.id }),
    ).rejects.toThrow(AuthError);
  });
});
