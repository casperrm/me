// Integration test for Cedar Innovation Lab v1 (Bible Section 21 / 6.4 /
// 20's "System improvement" decision type). Mocks match
// ai-supervisor.integration.test.ts's (innovation-lab-service.ts pulls in
// ai-supervisor-service.ts, which imports AuthError from auth-service.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { ROUTING_EVAL_SUITE } from "@cedar/ai";
import { getInnovationBacklog } from "./innovation-lab-service";

async function wipeVolatileTables() {
  await prisma.cedarBrainRequest.deleteMany();
  await prisma.workerJobFailure.deleteMany();
  await prisma.aiEvalResult.deleteMany();
  await prisma.aiEvalRun.deleteMany();
}

async function wipeDatabase() {
  await wipeVolatileTables();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Innovation Lab Test Agency" } });
  orgId = org.id;
});

afterEach(wipeVolatileTables);

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

async function createRequests(count: number, opts: { success: boolean; flaggedIncorrect?: boolean }) {
  for (let i = 0; i < count; i++) {
    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: orgId,
        prompt: `request ${i}`,
        routedAgents: "[]",
        mode: "stub",
        promptVersion: "v1",
        latencyMs: 10,
        success: opts.success,
        errorMessage: opts.success ? null : "stub failure",
        flaggedIncorrect: opts.flaggedIncorrect ?? false,
      },
    });
  }
}

describe("getInnovationBacklog", () => {
  it("returns an empty backlog when there is no concerning telemetry", async () => {
    await createRequests(5, { success: true });
    const backlog = await getInnovationBacklog(orgId);
    expect(backlog).toEqual([]);
  });

  it("flags Cedar Brain when success rate drops well below target, at high severity", async () => {
    await createRequests(2, { success: true });
    await createRequests(8, { success: false }); // 20% success rate

    const backlog = await getInnovationBacklog(orgId);
    const item = backlog.find((i) => i.title === "Cedar Brain success rate below target");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("high");
    expect(item!.evidence[0]).toContain("8 of 10 requests failed");
  });

  it("does not flag success rate below the minimum sample size", async () => {
    await createRequests(1, { success: true });
    await createRequests(3, { success: false }); // 25% success, only 4 total requests

    const backlog = await getInnovationBacklog(orgId);
    expect(backlog.some((i) => i.title === "Cedar Brain success rate below target")).toBe(false);
  });

  it("flags a Cedar Brain routing eval regression from the latest run, naming the failing cases", async () => {
    const run = await prisma.aiEvalRun.create({ data: { suite: ROUTING_EVAL_SUITE, totalCases: 10, passedCases: 8 } });
    await prisma.aiEvalResult.create({
      data: { evalRunId: run.id, caseName: "case-a", input: "{}", expected: '["marketing"]', actual: '["design"]', passed: false },
    });
    await prisma.aiEvalResult.create({
      data: { evalRunId: run.id, caseName: "case-b", input: "{}", expected: '["marketing"]', actual: '["design"]', passed: false },
    });

    const backlog = await getInnovationBacklog(orgId);
    const item = backlog.find((i) => i.title === "Cedar Brain routing eval regression");
    expect(item).toBeDefined();
    expect(item!.evidence.some((e) => e.includes("case-a"))).toBe(true);
  });

  it("flags an elevated user-flagged-incorrect rate", async () => {
    await createRequests(5, { success: true, flaggedIncorrect: true });
    await createRequests(5, { success: true, flaggedIncorrect: false });

    const backlog = await getInnovationBacklog(orgId);
    const item = backlog.find((i) => i.title === "Elevated user-flagged-incorrect rate");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("high"); // 50% flagged
  });

  it("flags a worker job failing repeatedly within the recent window, ignoring older and one-off failures", async () => {
    for (let i = 0; i < 3; i++) {
      await prisma.workerJobFailure.create({
        data: { queueName: "escalations", jobName: "scan", errorMessage: `err ${i}`, attemptsMade: 3 },
      });
    }
    // Outside the 7-day window — should not count toward the repeat threshold.
    await prisma.workerJobFailure.create({
      data: {
        queueName: "escalations",
        jobName: "scan",
        errorMessage: "old err",
        attemptsMade: 3,
        occurredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    // A single recent failure in a different job — below the repeat threshold.
    await prisma.workerJobFailure.create({
      data: { queueName: "health-scores", jobName: "score", errorMessage: "one-off", attemptsMade: 3 },
    });

    const backlog = await getInnovationBacklog(orgId);
    const item = backlog.find((i) => i.title === '"escalations/scan" job failing repeatedly');
    expect(item).toBeDefined();
    expect(item!.evidence[0]).toContain("3 exhausted-retry failure(s)");
    expect(backlog.some((i) => i.title.includes("health-scores"))).toBe(false);
  });

  it("sorts items by severity, most severe first", async () => {
    await createRequests(1, { success: true });
    await createRequests(9, { success: false }); // 10% success rate -> high
    for (let i = 0; i < 2; i++) {
      await prisma.workerJobFailure.create({
        data: { queueName: "ai-eval", jobName: "eval", errorMessage: `err ${i}`, attemptsMade: 3 },
      });
    } // exactly 2 recent failures -> low

    const backlog = await getInnovationBacklog(orgId);
    expect(backlog.length).toBeGreaterThanOrEqual(2);
    expect(backlog[0].severity).toBe("high");
    expect(backlog[backlog.length - 1].severity).not.toBe("high");
  });
});
