// Integration test for Quality Control (Bible Section 5 / 6.1 / 7).
// See identity.integration.test.ts for why next/headers and server-only
// are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { createBrandVersion, type BrandVersionInput } from "./brand-service";
import { createCampaign, createCreative, requestApproval } from "./creative-service";
import { runQualityChecks } from "./qc-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.qualityCheckResult.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.brandProfileVersion.deleteMany();
  await prisma.brandProfile.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

const brandInput: BrandVersionInput = {
  colors: [],
  fonts: [],
  toneOfVoice: "",
  visualStyle: "",
  targetAudience: "",
  products: [],
  approvedPatterns: [],
  rejectedPatterns: [],
  prohibitedLanguage: ["guaranteed results", "risk-free"],
  requiredDisclaimers: ["Terms and conditions apply"],
};

let orgId: string;
let ownerUserId: string;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "QC Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "qc-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "QC Client", companyName: "QC Co", services: "[]" },
  });
  clientId = client.id;

  await createBrandVersion({ actorUserId: ownerUserId, organizationId: orgId, clientId, input: brandInput });

  const project = await prisma.project.create({ data: { clientId, name: "QC Launch" } });
  projectId = project.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("runQualityChecks", () => {
  it("fails when creative text contains prohibited language", async () => {
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "Bad copy campaign" });
    const creative = await createCreative({
      actorUserId: ownerUserId,
      organizationId: orgId,
      campaignId: campaign.id,
      type: "image",
      notes: "This offer gives you guaranteed results overnight.",
    });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    const result = await runQualityChecks(v1.id);
    expect(result.overallStatus).toBe("fail");
    const prohibited = result.checks.find((c) => c.name === "prohibited_language");
    expect(prohibited?.status).toBe("fail");
    expect(prohibited?.message).toContain("guaranteed results");

    const stored = await prisma.qualityCheckResult.findFirst({ where: { creativeVersionId: v1.id } });
    expect(stored?.overallStatus).toBe("fail");
  });

  it("warns when a required disclaimer is missing but nothing is prohibited", async () => {
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "Missing disclaimer campaign" });
    const creative = await createCreative({
      actorUserId: ownerUserId,
      organizationId: orgId,
      campaignId: campaign.id,
      type: "image",
      notes: "Clean, on-brand copy with no issues.",
    });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    const result = await runQualityChecks(v1.id);
    expect(result.overallStatus).toBe("warning");
    const disclaimers = result.checks.find((c) => c.name === "required_disclaimers");
    expect(disclaimers?.status).toBe("warning");
    expect(disclaimers?.message).toContain("Terms and conditions apply");
  });

  it("passes cleanly when the disclaimer is present and nothing is prohibited", async () => {
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "Clean campaign" });
    const creative = await createCreative({
      actorUserId: ownerUserId,
      organizationId: orgId,
      campaignId: campaign.id,
      type: "image",
      notes: "Great new product. Terms and conditions apply.",
    });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    const result = await runQualityChecks(v1.id);
    expect(result.overallStatus).toBe("pass");
  });

  it("runs automatically (and non-blockingly) when requestApproval is called", async () => {
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "Auto QC campaign" });
    const creative = await createCreative({
      actorUserId: ownerUserId,
      organizationId: orgId,
      campaignId: campaign.id,
      type: "image",
      notes: "This is risk-free and guaranteed results, act now!",
    });
    const v1 = await prisma.creativeVersion.findFirstOrThrow({ where: { creativeId: creative.id, version: 1 } });

    await requestApproval({ actorUserId: ownerUserId, organizationId: orgId, creativeVersionId: v1.id });

    // The creative still moved to PENDING_APPROVAL — QC is advisory, never blocking.
    const updated = await prisma.creative.findUniqueOrThrow({ where: { id: creative.id } });
    expect(updated.status).toBe("PENDING_APPROVAL");

    const qc = await prisma.qualityCheckResult.findFirst({ where: { creativeVersionId: v1.id } });
    expect(qc?.overallStatus).toBe("fail");
  });
});
