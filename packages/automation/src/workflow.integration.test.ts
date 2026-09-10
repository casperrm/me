// This package's first-ever test file (confirmed via `find` before
// writing — packages/automation had zero tests until now). Against real
// Postgres: runWorkflow() persists a real WorkflowRun row, so this can't
// be tested with mocks without losing the exact thing that matters —
// that a run is actually durable and queryable afterward.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { runWorkflow, type WorkflowDefinition } from "./workflow";

async function wipeWorkflowRuns() {
  await prisma.workflowRun.deleteMany();
}

beforeEach(wipeWorkflowRuns);
afterAll(async () => {
  await wipeWorkflowRuns();
  await prisma.$disconnect();
});

describe("runWorkflow", () => {
  it("persists a completed run with real step history when every step succeeds", async () => {
    const definition: WorkflowDefinition<void> = {
      key: "test-all-success",
      steps: [
        { name: "step-a", run: async () => ({ count: 1 }) },
        { name: "step-b", run: async () => ({ count: 2 }) },
      ],
    };

    const outcome = await runWorkflow({ definition, context: undefined });

    expect(outcome.status).toBe("completed");
    expect(outcome.steps.map((s) => s.status)).toEqual(["success", "success"]);

    const stored = await prisma.workflowRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(stored.workflowKey).toBe("test-all-success");
    expect(stored.status).toBe("completed");
    expect(stored.finishedAt).not.toBeNull();
    const storedSteps = JSON.parse(stored.steps);
    expect(storedSteps).toHaveLength(2);
    expect(storedSteps[0].output).toEqual({ count: 1 });
  });

  it("isolates a failing step: the run is completed_with_errors and the remaining steps still run", async () => {
    const ranAfterFailure: string[] = [];
    const definition: WorkflowDefinition<void> = {
      key: "test-partial-failure",
      steps: [
        {
          name: "healthy-step",
          run: async () => {
            ranAfterFailure.push("healthy-step");
            return { ok: true };
          },
        },
        {
          name: "broken-step",
          run: async () => {
            throw new Error("simulated failure in one category");
          },
        },
        {
          name: "another-healthy-step",
          run: async () => {
            ranAfterFailure.push("another-healthy-step");
            return { ok: true };
          },
        },
      ],
    };

    const outcome = await runWorkflow({ definition, context: undefined });

    // The real behavior this exists to prove: a bare Promise.all would
    // have aborted on the first rejection, so "another-healthy-step"
    // would never have run at all.
    expect(ranAfterFailure).toEqual(["healthy-step", "another-healthy-step"]);
    expect(outcome.status).toBe("completed_with_errors");
    expect(outcome.steps.map((s) => s.status)).toEqual(["success", "failed", "success"]);
    expect(outcome.steps[1].error).toContain("simulated failure in one category");

    const stored = await prisma.workflowRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(stored.status).toBe("completed_with_errors");
  });

  it("marks the run failed only when every step fails", async () => {
    const definition: WorkflowDefinition<void> = {
      key: "test-total-failure",
      steps: [
        {
          name: "only-step",
          run: async () => {
            throw new Error("everything is broken");
          },
        },
      ],
    };

    const outcome = await runWorkflow({ definition, context: undefined });

    expect(outcome.status).toBe("failed");
    const stored = await prisma.workflowRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(stored.status).toBe("failed");
  });

  it("passes a real context value through to every step", async () => {
    interface Ctx {
      multiplier: number;
    }
    const seen: number[] = [];
    const definition: WorkflowDefinition<Ctx> = {
      key: "test-context",
      steps: [
        { name: "step-a", run: async (ctx) => void seen.push(ctx.multiplier * 2) },
        { name: "step-b", run: async (ctx) => void seen.push(ctx.multiplier * 3) },
      ],
    };

    await runWorkflow({ definition, context: { multiplier: 5 } });

    expect(seen).toEqual([10, 15]);
  });
});
