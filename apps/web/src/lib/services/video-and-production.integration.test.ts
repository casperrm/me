// Integration test for the Video Studio (Section 11.1) and Photography/
// Production (Section 11.2) services. See identity.integration.test.ts
// for why next/headers and server-only are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { saveVideoBrief } from "./video-brief-service";
import { createShoot, setShootStatus } from "./shoot-service";
import { createCampaign, createCreative } from "./creative-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.shoot.deleteMany();
  await prisma.videoBriefVersion.deleteMany();
  await prisma.videoBrief.deleteMany();
  await prisma.qualityCheckResult.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Video Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "video-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Video Client", companyName: "Video Co", services: "[]" },
  });
  clientId = client.id;

  const project = await prisma.project.create({ data: { clientId, name: "Launch" } });
  projectId = project.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("saveVideoBrief — Section 11.1", () => {
  it("creates version 1 on first save and version 2 on the next, never overwriting", async () => {
    const campaign = await createCampaign({ actorUserId: ownerUserId, organizationId: orgId, projectId, name: "Video Campaign" });
    const creative = await createCreative({ actorUserId: ownerUserId, organizationId: orgId, campaignId: campaign.id, type: "video" });

    const v1 = await saveVideoBrief({
      actorUserId: ownerUserId,
      organizationId: orgId,
      creativeId: creative.id,
      input: { concept: "Product hero", hook: "Wait for it...", platformVariants: ["9:16", "1:1"] },
    });
    expect(v1.version).toBe(1);
    expect(v1.concept).toBe("Product hero");

    const v2 = await saveVideoBrief({
      actorUserId: ownerUserId,
      organizationId: orgId,
      creativeId: creative.id,
      input: { concept: "Revised hero shot", script: "Open on product..." },
    });
    expect(v2.version).toBe(2);
    expect(v2.concept).toBe("Revised hero shot");

    // v1 is untouched — versioned, not mutated.
    const stillV1 = await prisma.videoBriefVersion.findFirst({ where: { videoBriefId: v1.videoBriefId, version: 1 } });
    expect(stillV1?.concept).toBe("Product hero");

    const brief = await prisma.videoBrief.findUnique({ where: { creativeId: creative.id } });
    expect(brief?.currentVersion).toBe(2);
  });

  it("rejects a member with no clients:write on this client", async () => {
    const designer = await prisma.user.create({
      data: { email: "video-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: orgId, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

    const creative = await prisma.creative.findFirstOrThrow({ where: { campaign: { projectId } } });

    await expect(
      saveVideoBrief({ actorUserId: designer.id, organizationId: orgId, creativeId: creative.id, input: { concept: "Should fail" } }),
    ).rejects.toThrow();
  });
});

describe("createShoot / setShootStatus — Section 11.2", () => {
  it("creates a shoot with crew/equipment/shot list and transitions its status", async () => {
    const shoot = await createShoot({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      title: "Product photography day",
      projectId,
      location: "Studio A",
      crew: [{ name: "Jamie", role: "Photographer", contact: "jamie@example.com" }],
      equipment: ["Camera A7IV", "Softbox x2"],
      shotList: [{ description: "Hero product shot", status: "pending" }],
    });
    expect(shoot.status).toBe("PLANNED");

    const updated = await setShootStatus({ actorUserId: ownerUserId, organizationId: orgId, shootId: shoot.id, status: "CONFIRMED" });
    expect(updated.status).toBe("CONFIRMED");

    const completed = await setShootStatus({ actorUserId: ownerUserId, organizationId: orgId, shootId: shoot.id, status: "COMPLETED" });
    expect(completed.status).toBe("COMPLETED");
  });

  it("rejects a project that doesn't belong to the client", async () => {
    const otherClient = await prisma.client.create({
      data: { organizationId: orgId, name: "Other Client", companyName: "Other Co", services: "[]" },
    });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });

    await expect(
      createShoot({ actorUserId: ownerUserId, organizationId: orgId, clientId, title: "Bad link", projectId: otherProject.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a shoot status update for a shoot outside the caller's organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Org Client", companyName: "X", services: "[]" },
    });
    const otherShoot = await prisma.shoot.create({ data: { clientId: otherClient.id, title: "Not yours" } });

    await expect(
      setShootStatus({ actorUserId: ownerUserId, organizationId: orgId, shootId: otherShoot.id, status: "CONFIRMED" }),
    ).rejects.toThrow(AuthError);
  });
});
