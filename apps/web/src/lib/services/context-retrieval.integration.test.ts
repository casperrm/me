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
import { buildGovernedContext, getRecentCedarBrainActivityForClient } from "./context-retrieval-service";

async function wipeDatabase() {
  await prisma.cedarBrainRequest.deleteMany();
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
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

  // Section 19's Knowledge Graph example chain: Client -> Meeting ->
  // Decision. One meeting with a real decision (must appear in context),
  // one with none (must contribute nothing — no fabricated "no decisions"
  // line for it).
  await prisma.meeting.create({
    data: {
      organizationId: org.id,
      clientId: clientAId,
      title: "Q1 kickoff",
      decisions: JSON.stringify([{ id: "d1", text: "Launch on the 15th, not the 1st.", rationale: null, createdAt: new Date().toISOString() }]),
    },
  });
  await prisma.meeting.create({
    data: { organizationId: org.id, clientId: clientAId, title: "Status check-in, no decisions made" },
  });

  // A prior successful Cedar Brain request for Client A — real material
  // for the "prior answers" context section.
  await prisma.cedarBrainRequest.create({
    data: {
      organizationId: org.id,
      clientId: clientAId,
      prompt: "Draft a launch hook for FastCharge Pro",
      routedAgents: "[]",
      response: JSON.stringify({ summary: "Try: 'Charge in the time it takes to check your notifications.'" }),
      mode: "live",
      modelName: "claude-sonnet-5",
      promptVersion: "v2",
      latencyMs: 500,
      success: true,
    },
  });
  // A failed request — must never be fed back into the model's context.
  await prisma.cedarBrainRequest.create({
    data: {
      organizationId: org.id,
      clientId: clientAId,
      prompt: "This one failed",
      routedAgents: "[]",
      response: null,
      mode: "live",
      modelName: "claude-sonnet-5",
      promptVersion: "v2",
      latencyMs: 300,
      success: false,
      errorMessage: "Anthropic API error (500)",
    },
  });
  // A successful request a human reviewer already flagged as wrong
  // (Section 6.3's AI Supervisor) — must never be fed back into the
  // model's context either, even though it succeeded.
  await prisma.cedarBrainRequest.create({
    data: {
      organizationId: org.id,
      clientId: clientAId,
      prompt: "This one was flagged incorrect",
      routedAgents: "[]",
      response: JSON.stringify({ summary: "A confidently wrong answer that a reviewer caught." }),
      mode: "live",
      modelName: "claude-sonnet-5",
      promptVersion: "v2",
      latencyMs: 400,
      success: true,
      flaggedIncorrect: true,
      flaggedAt: new Date(),
    },
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
    expect(context.text).toContain("Charge in the time it takes to check your notifications.");
    // Section 19's Knowledge Graph chain: Client -> Meeting -> Decision.
    expect(context.text).toContain("Launch on the 15th, not the 1st.");
    expect(context.text).toContain("Q1 kickoff");

    expect(context.sources).toContain("Client record");
    expect(context.sources.some((s) => s.startsWith("Brand DNA"))).toBe(true);
    expect(context.sources.some((s) => s.includes("82/100"))).toBe(true);
    expect(context.sources.some((s) => s.includes("timeline event"))).toBe(true);
    expect(context.sources.some((s) => s.includes("prior Cedar Brain answer"))).toBe(true);
    expect(context.sources).toContain("1 recent meeting decision(s)");
  });

  it("includes a decision from every meeting that recorded one, but contributes nothing for a meeting with none", async () => {
    const context = await buildGovernedContext({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId });
    // The second meeting fixture ("Status check-in, no decisions made")
    // has no decisions JSON at all — its title must never appear, since
    // this section only exists to report actual decisions, not meetings.
    expect(context.text).not.toContain("Status check-in, no decisions made");
  });

  it("never feeds a failed prior request's (non-existent) content back into the model's context", async () => {
    const context = await buildGovernedContext({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId });
    expect(context.text).not.toContain("This one failed");
    // Only the one successful, never-flagged prior request counts as a
    // source, not the failed one or the flagged-incorrect one.
    expect(context.sources.find((s) => s.includes("prior Cedar Brain answer"))).toBe("1 prior Cedar Brain answer(s)");
  });

  it("never feeds a flagged-incorrect prior request's content back into the model's context, even though it succeeded", async () => {
    const context = await buildGovernedContext({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId });
    expect(context.text).not.toContain("A confidently wrong answer that a reviewer caught.");
    expect(context.text).not.toContain("This one was flagged incorrect");
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

describe("getRecentCedarBrainActivityForClient", () => {
  it("returns successful, failed, and flagged requests alike, most recent first, with a real summary excerpt", async () => {
    // Limit raised to 3 for this test — the default RECENT_CEDAR_BRAIN_LIMIT
    // of 3 already covers all three fixture rows, but stating it explicitly
    // documents intent as the fixture grows.
    const activity = await getRecentCedarBrainActivityForClient(clientAId, orgId, 3);
    expect(activity).toHaveLength(3);
    expect(activity[0]).toMatchObject({ prompt: "This one was flagged incorrect", success: true, flaggedIncorrect: true });
    expect(activity[1]).toMatchObject({ prompt: "This one failed", success: false, summaryExcerpt: null, flaggedIncorrect: false });
    expect(activity[2]).toMatchObject({ prompt: "Draft a launch hook for FastCharge Pro", success: true, flaggedIncorrect: false });
    expect(activity[2].summaryExcerpt).toContain("Charge in the time it takes");
  });

  it("returns nothing for a client with no Cedar Brain history", async () => {
    const activity = await getRecentCedarBrainActivityForClient(clientBId, orgId);
    expect(activity).toEqual([]);
  });
});
