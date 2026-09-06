// Integration test for Brand DNA versioning — see identity.integration.test.ts
// for why the mocks below exist (brand-service.ts pulls in auth-service.ts
// for the AuthError class, which transitively imports next/headers).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { createBrandVersion, type BrandVersionInput } from "./brand-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.brandProfileVersion.deleteMany();
  await prisma.brandProfile.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

const sampleInput: BrandVersionInput = {
  colors: [{ name: "Volt Yellow", hex: "#F5C518" }],
  fonts: [{ role: "Heading", family: "Poppins" }],
  toneOfVoice: "Energetic",
  visualStyle: "Bold",
  targetAudience: "18-34",
  products: ["Chargers"],
  approvedPatterns: [{ pattern: "Bold backgrounds", rationale: "High engagement" }],
  rejectedPatterns: [],
  prohibitedLanguage: ["guaranteed results"],
  requiredDisclaimers: ["Terms apply"],
};

let orgId: string;
let ownerUserId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Brand Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "brand-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Test Client", companyName: "Test Co", services: "[]" },
  });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createBrandVersion", () => {
  it("creates version 1 and sets it as current", async () => {
    const version = await createBrandVersion({ actorUserId: ownerUserId, organizationId: orgId, clientId, input: sampleInput });
    expect(version.version).toBe(1);

    const profile = await prisma.brandProfile.findUniqueOrThrow({ where: { clientId } });
    expect(profile.currentVersion).toBe(1);
  });

  it("a second save creates version 2 without touching version 1", async () => {
    const updated = { ...sampleInput, toneOfVoice: "Even more energetic" };
    const version = await createBrandVersion({ actorUserId: ownerUserId, organizationId: orgId, clientId, input: updated });
    expect(version.version).toBe(2);

    const [v1, v2] = await Promise.all([
      prisma.brandProfileVersion.findFirst({ where: { version: 1 } }),
      prisma.brandProfileVersion.findFirst({ where: { version: 2 } }),
    ]);
    expect(v1?.toneOfVoice).toBe("Energetic");
    expect(v2?.toneOfVoice).toBe("Even more energetic");

    const profile = await prisma.brandProfile.findUniqueOrThrow({ where: { clientId } });
    expect(profile.currentVersion).toBe(2);
  });

  it("records an audit event and a client timeline event for every save", async () => {
    const auditCount = await prisma.auditEvent.count({ where: { action: "brand_profile.version_created", clientId } });
    const timelineCount = await prisma.clientTimelineEvent.count({ where: { clientId, type: "brand_dna_updated" } });
    expect(auditCount).toBe(2);
    expect(timelineCount).toBe(2);
  });

  it("rejects a member with no clients:write permission on this client", async () => {
    const designer = await prisma.user.create({
      data: { email: "designer@test.example", name: "Designer", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: orgId, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

    await expect(
      createBrandVersion({ actorUserId: designer.id, organizationId: orgId, clientId, input: sampleInput }),
    ).rejects.toThrow();
  });

  it("rejects a client that doesn't belong to the given organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "Other Co", services: "[]" },
    });

    await expect(
      createBrandVersion({ actorUserId: ownerUserId, organizationId: orgId, clientId: otherClient.id, input: sampleInput }),
    ).rejects.toThrow(AuthError);
  });
});
