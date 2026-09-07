// Integration test for the Opportunity Engine (Bible Section 4.2). No
// server-only/next-headers mocks needed — opportunity-service.ts is a
// pure Prisma query module with no session/cookie dependency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { getOpportunitiesForClient } from "./opportunity-service";

async function wipeDatabase() {
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let targetClientId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Opportunity Test Agency" } });
  orgId = org.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("getOpportunitiesForClient — service gap", () => {
  it("surfaces a service used by 2+ peer clients but not this one", async () => {
    const target = await prisma.client.create({
      data: { organizationId: orgId, name: "Target Client", companyName: "T Inc", services: JSON.stringify(["social"]) },
    });
    targetClientId = target.id;

    await prisma.client.create({
      data: { organizationId: orgId, name: "Peer A", companyName: "A Inc", services: JSON.stringify(["social", "video"]) },
    });
    await prisma.client.create({
      data: { organizationId: orgId, name: "Peer B", companyName: "B Inc", services: JSON.stringify(["video", "seo"]) },
    });

    const opportunities = await getOpportunitiesForClient(targetClientId, orgId);
    const videoGap = opportunities.find((o) => o.type === "service_gap" && o.label === "video");
    expect(videoGap).toBeTruthy();
    expect(videoGap!.peerCount).toBe(2);

    // Only one peer has "seo" — below the evidence threshold, must not appear.
    expect(opportunities.some((o) => o.label === "seo")).toBe(false);
    // The client's own service must never appear as a gap.
    expect(opportunities.some((o) => o.label === "social")).toBe(false);
  });
});

describe("getOpportunitiesForClient — creative format gap", () => {
  it("surfaces a creative format used for 2+ other clients but never for this one", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Format Target", companyName: "FT Inc", services: "[]" },
    });

    const peerA = await prisma.client.create({ data: { organizationId: orgId, name: "Format Peer A", companyName: "X", services: "[]" } });
    const peerB = await prisma.client.create({ data: { organizationId: orgId, name: "Format Peer B", companyName: "Y", services: "[]" } });

    for (const peer of [peerA, peerB]) {
      const project = await prisma.project.create({ data: { clientId: peer.id, name: "Peer Project" } });
      const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "Peer Campaign" } });
      await prisma.creative.create({ data: { campaignId: campaign.id, type: "video" } });
    }

    // The target client has only ever had image creatives.
    const project = await prisma.project.create({ data: { clientId: client.id, name: "Target Project" } });
    const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "Target Campaign" } });
    await prisma.creative.create({ data: { campaignId: campaign.id, type: "image" } });

    const opportunities = await getOpportunitiesForClient(client.id, orgId);
    const videoFormatGap = opportunities.find((o) => o.type === "creative_format_gap" && o.label === "video");
    expect(videoFormatGap).toBeTruthy();
    expect(videoFormatGap!.peerCount).toBe(2);

    // The client's own format must never appear as a gap.
    expect(opportunities.some((o) => o.type === "creative_format_gap" && o.label === "image")).toBe(false);
  });

  it("counts distinct peer clients, not distinct creatives — one prolific peer isn't 'evidence' on its own", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Prolific Peer Target", companyName: "PPT Inc", services: "[]" },
    });
    const onePeer = await prisma.client.create({ data: { organizationId: orgId, name: "One Prolific Peer", companyName: "Z", services: "[]" } });

    const project = await prisma.project.create({ data: { clientId: onePeer.id, name: "Prolific Project" } });
    const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "Prolific Campaign" } });
    // Same single peer makes 5 "carousel" creatives — still only 1 distinct client.
    for (let i = 0; i < 5; i++) {
      await prisma.creative.create({ data: { campaignId: campaign.id, type: "carousel" } });
    }

    const opportunities = await getOpportunitiesForClient(client.id, orgId);
    expect(opportunities.some((o) => o.type === "creative_format_gap" && o.label === "carousel")).toBe(false);
  });
});

describe("getOpportunitiesForClient — peer-format aggregation (Phase 7 scale hardening)", () => {
  it("computes correct per-format peer counts via a single GROUP BY when peers use multiple formats", async () => {
    // Regression coverage for the Phase 7 rewrite (opportunity-service.ts)
    // from per-row JS aggregation to a raw SQL GROUP BY: this exercises
    // multiple distinct format values across multiple peers in one call,
    // which is exactly the shape a naive GROUP BY could get wrong (e.g.
    // mixing up rows across groups) in a way a single-format test can't
    // catch. See docs/specs/opportunity-engine-scaling.md.
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Multi-Format Target", companyName: "MFT Inc", services: "[]" },
    });
    const peerA = await prisma.client.create({ data: { organizationId: orgId, name: "Multi Peer A", companyName: "MA", services: "[]" } });
    const peerB = await prisma.client.create({ data: { organizationId: orgId, name: "Multi Peer B", companyName: "MB", services: "[]" } });
    const peerC = await prisma.client.create({ data: { organizationId: orgId, name: "Multi Peer C", companyName: "MC", services: "[]" } });

    // "reel": peers A and B (2 distinct clients) — should surface.
    for (const peer of [peerA, peerB]) {
      const project = await prisma.project.create({ data: { clientId: peer.id, name: "P" } });
      const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "C" } });
      await prisma.creative.create({ data: { campaignId: campaign.id, type: "reel" } });
    }
    // "podcast_clip": only peer C (1 distinct client) — below threshold.
    const projectC = await prisma.project.create({ data: { clientId: peerC.id, name: "P" } });
    const campaignC = await prisma.campaign.create({ data: { projectId: projectC.id, name: "C" } });
    await prisma.creative.create({ data: { campaignId: campaignC.id, type: "podcast_clip" } });

    // Target client already has 3 "banner" creatives of its own — the
    // `distinct: ["type"]` own-formats query must collapse these to one
    // entry so "banner" never appears as a gap, regardless of how many
    // rows exist.
    const ownProject = await prisma.project.create({ data: { clientId: client.id, name: "Own" } });
    const ownCampaign = await prisma.campaign.create({ data: { projectId: ownProject.id, name: "Own" } });
    for (let i = 0; i < 3; i++) {
      await prisma.creative.create({ data: { campaignId: ownCampaign.id, type: "banner" } });
    }

    const opportunities = await getOpportunitiesForClient(client.id, orgId);
    const formatGaps = opportunities.filter((o) => o.type === "creative_format_gap");

    expect(formatGaps.find((o) => o.label === "reel")?.peerCount).toBe(2);
    expect(formatGaps.some((o) => o.label === "podcast_clip")).toBe(false);
    expect(formatGaps.some((o) => o.label === "banner")).toBe(false);
  });
});

describe("getOpportunitiesForClient — isolation", () => {
  it("never uses clients from a different organization as evidence", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Org Client A", companyName: "X", services: JSON.stringify(["podcast"]) },
    });
    await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Org Client B", companyName: "Y", services: JSON.stringify(["podcast"]) },
    });

    const opportunities = await getOpportunitiesForClient(targetClientId, orgId);
    expect(opportunities.some((o) => o.label === "podcast")).toBe(false);
  });
});
