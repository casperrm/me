// Integration test for AI Supervisor telemetry (Bible Section 6.3). See
// identity.integration.test.ts for why next/headers and server-only are
// mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { flagCedarBrainRequest, getAiSupervisorSummary, listRecentWorkerJobFailures } from "./ai-supervisor-service";

async function wipeDatabase() {
  await prisma.cedarBrainRequest.deleteMany();
  await prisma.workerJobFailure.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "AI Supervisor Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "ai-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  // Two successful live requests with real token usage.
  await prisma.cedarBrainRequest.create({
    data: {
      organizationId: orgId,
      prompt: "Create a launch campaign for Client X",
      routedAgents: "[]",
      mode: "live",
      modelName: "claude-sonnet-5",
      promptVersion: "v1",
      latencyMs: 800,
      success: true,
      inputTokens: 100,
      outputTokens: 200,
    },
  });
  await prisma.cedarBrainRequest.create({
    data: {
      organizationId: orgId,
      prompt: "Draft three ad hooks",
      routedAgents: "[]",
      mode: "live",
      modelName: "claude-sonnet-5",
      promptVersion: "v1",
      latencyMs: 400,
      success: true,
      inputTokens: 50,
      outputTokens: 150,
    },
  });

  // One stub request (no API key configured at request time).
  await prisma.cedarBrainRequest.create({
    data: {
      organizationId: orgId,
      prompt: "What's our brand voice?",
      routedAgents: "[]",
      mode: "stub",
      promptVersion: "v1",
      latencyMs: 5,
      success: true,
    },
  });

  // One failed live request.
  await prisma.cedarBrainRequest.create({
    data: {
      organizationId: orgId,
      prompt: "Generate a full video script",
      routedAgents: "[]",
      mode: "live",
      modelName: "claude-sonnet-5",
      promptVersion: "v1",
      latencyMs: 1200,
      success: false,
      errorMessage: "Anthropic API error (529): overloaded",
    },
  });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("getAiSupervisorSummary", () => {
  it("computes real aggregates from recorded telemetry", async () => {
    const summary = await getAiSupervisorSummary(orgId);

    expect(summary.totalRequests).toBe(4);
    expect(summary.successCount).toBe(3);
    expect(summary.failureCount).toBe(1);
    expect(summary.successRatePct).toBeCloseTo(75);
    expect(summary.avgLatencyMs).toBeCloseTo((800 + 400 + 5 + 1200) / 4);
    expect(summary.liveCount).toBe(3);
    expect(summary.stubCount).toBe(1);
    expect(summary.totalInputTokens).toBe(150);
    expect(summary.totalOutputTokens).toBe(350);
    expect(summary.recentFailures).toHaveLength(1);
    expect(summary.recentFailures[0].errorMessage).toContain("overloaded");
  });

  it("reports null success rate and latency for an organization with no requests", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Empty Org" } });
    const summary = await getAiSupervisorSummary(otherOrg.id);
    expect(summary.totalRequests).toBe(0);
    expect(summary.successRatePct).toBeNull();
    expect(summary.avgLatencyMs).toBeNull();
  });
});

describe("flagCedarBrainRequest", () => {
  it("marks a request flagged and attributes it to the acting member", async () => {
    const request = await prisma.cedarBrainRequest.findFirstOrThrow({ where: { organizationId: orgId, success: true } });

    const flagged = await flagCedarBrainRequest({ actorUserId: ownerUserId, organizationId: orgId, requestId: request.id });
    expect(flagged.flaggedIncorrect).toBe(true);
    expect(flagged.flaggedAt).not.toBeNull();

    const summary = await getAiSupervisorSummary(orgId);
    expect(summary.flaggedIncorrectCount).toBe(1);
    expect(summary.recentFlagged[0].flaggedByName).toBe("Owner");
  });

  it("rejects flagging a request from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherRequest = await prisma.cedarBrainRequest.create({
      data: {
        organizationId: otherOrg.id,
        prompt: "Not yours",
        routedAgents: "[]",
        mode: "stub",
        promptVersion: "v1",
        latencyMs: 5,
        success: true,
      },
    });

    await expect(
      flagCedarBrainRequest({ actorUserId: ownerUserId, organizationId: orgId, requestId: otherRequest.id }),
    ).rejects.toThrow(AuthError);
  });
});

describe("listRecentWorkerJobFailures", () => {
  it("returns real dead-letter rows, newest first, deployment-wide (not organization-scoped)", async () => {
    await prisma.workerJobFailure.deleteMany();

    const older = await prisma.workerJobFailure.create({
      data: { queueName: "escalations", jobName: "scan", errorMessage: "db timeout", attemptsMade: 3, occurredAt: new Date(Date.now() - 60000) },
    });
    const newer = await prisma.workerJobFailure.create({
      data: { queueName: "health-scores", jobName: "score", errorMessage: "unexpected null", attemptsMade: 3 },
    });

    const failures = await listRecentWorkerJobFailures();
    expect(failures.map((f) => f.id)).toEqual([newer.id, older.id]);
  });

  it("respects the limit parameter", async () => {
    await prisma.workerJobFailure.deleteMany();
    for (let i = 0; i < 5; i++) {
      await prisma.workerJobFailure.create({
        data: { queueName: "ai-eval", jobName: "eval", errorMessage: `failure ${i}`, attemptsMade: 3 },
      });
    }

    const failures = await listRecentWorkerJobFailures(2);
    expect(failures).toHaveLength(2);
  });
});
