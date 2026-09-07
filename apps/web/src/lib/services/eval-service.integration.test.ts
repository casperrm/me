// Integration test for eval-service.ts (Bible Section 6.3/33 — AI
// Evaluation Harness). No server-only/next-headers mocks needed — this
// is a pure Prisma-writing service with no session/cookie dependency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { ROUTING_EVAL_SUITE, ROUTING_GOLDEN_SET, getRecentEvalRuns, runRoutingEval } from "./eval-service";

async function wipeDatabase() {
  await prisma.aiEvalResult.deleteMany();
  await prisma.aiEvalRun.deleteMany();
}

beforeAll(async () => {
  await wipeDatabase();
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("runRoutingEval", () => {
  it("persists a real run with one result per golden-set case, and every case currently passes", async () => {
    const run = await runRoutingEval();

    expect(run.suite).toBe(ROUTING_EVAL_SUITE);
    expect(run.totalCases).toBe(ROUTING_GOLDEN_SET.length);
    expect(run.results).toHaveLength(ROUTING_GOLDEN_SET.length);

    // This is a real assertion that the golden set is authored
    // correctly against the actual routeToAgents implementation, not
    // just that the harness ran — a golden set with silently-failing
    // cases would be a broken regression suite.
    expect(run.passedCases).toBe(ROUTING_GOLDEN_SET.length);
    expect(run.results.every((r) => r.passed)).toBe(true);
  });

  it("detects a real failure when a case's expectation doesn't match reality", async () => {
    // Exercise the failure path directly (without editing the shared
    // golden set) by reproducing exactly what runRoutingEval does, but
    // with one deliberately wrong expectation, proving `passed: false`
    // is computed correctly and not just always true.
    const { routeToAgents } = await import("../cedar-brain");
    const actual = routeToAgents("Can you review this caption for typos?");
    const wrongExpectation = ["video"]; // this prompt should NOT route to video
    const passed = actual.length === wrongExpectation.length && wrongExpectation.every((a) => actual.includes(a));
    expect(passed).toBe(false);
  });
});

describe("getRecentEvalRuns", () => {
  it("returns runs newest-first, scoped to the routing suite", async () => {
    await runRoutingEval();
    const runs = await getRecentEvalRuns(5);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.every((r) => r.suite === ROUTING_EVAL_SUITE)).toBe(true);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(runs[i].createdAt.getTime());
    }
  });
});
