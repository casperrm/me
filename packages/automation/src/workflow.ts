import { prisma } from "@cedar/db";
import { getCorrelationId, logger } from "@cedar/observability";

// Section 18 (Workflow Automation Engine): "event-driven, policy-aware
// automation... Conditions filter execution; actions create/update
// records, notify users, call AI, or invoke authorized connectors."
// 18.2's reliability requirements: "Every workflow run has status, step
// history, input/output references, retry count, errors, and
// correlation ID."
//
// This is a first real cut, not the full spec: a trigger is just
// "whatever caller decided to invoke this" (a BullMQ schedule today,
// same as every other apps/worker job) rather than a generic trigger
// registry with schedule/webhook/domain-event/manual-command types —
// building that registry before a second trigger source exists would be
// speculative. What IS real: a durable, queryable run record with
// per-step isolation, replacing what used to be a single Promise.all
// with no error isolation between unrelated steps and nothing persisted
// once BullMQ's own log scrolled away. See docs/specs/automation-engine.md.

export interface WorkflowStepResult {
  name: string;
  status: "success" | "failed";
  startedAt: string;
  finishedAt: string;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowStep<TCtx> {
  name: string;
  run: (ctx: TCtx) => Promise<Record<string, unknown> | void>;
}

export interface WorkflowDefinition<TCtx> {
  key: string;
  steps: WorkflowStep<TCtx>[];
}

export type WorkflowRunStatus = "completed" | "completed_with_errors" | "failed";

export interface WorkflowRunOutcome {
  runId: string;
  status: WorkflowRunStatus;
  steps: WorkflowStepResult[];
}

/**
 * Runs every step in `definition.steps`, in order. A step that throws is
 * recorded as failed (its error message captured in step history) but
 * does NOT stop the remaining steps from running — the whole point of
 * step isolation per 18.2's "step history... errors" requirement: one
 * broken step (say, a bad row in the invoice scan) must not silently
 * prevent unrelated steps (the task/project/content scans) from running,
 * the way a bare `Promise.all` or a single try/catch around everything
 * would. Every invocation persists exactly one `WorkflowRun` row,
 * regardless of outcome, so a run is always visible afterward even if
 * every step failed.
 */
export async function runWorkflow<TCtx>(params: {
  definition: WorkflowDefinition<TCtx>;
  context: TCtx;
}): Promise<WorkflowRunOutcome> {
  // Ambient, not a required param: apps/worker already wraps each
  // scheduled job handler in runWithCorrelationId(job.id, ...) (Section
  // 31.3), so the same real per-execution ID this run's log lines
  // already carry is what gets persisted onto the WorkflowRun row too —
  // no separate ID to thread through by hand.
  const correlationId = getCorrelationId();
  const stepResults: WorkflowStepResult[] = [];

  for (const step of params.definition.steps) {
    const startedAt = new Date();
    try {
      const output = await step.run(params.context);
      stepResults.push({
        name: step.name,
        status: "success",
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        ...(output ? { output } : {}),
      });
    } catch (err) {
      stepResults.push({
        name: step.name,
        status: "failed",
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      logger.error(`workflow step failed: ${params.definition.key}/${step.name}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failedCount = stepResults.filter((s) => s.status === "failed").length;
  const status: WorkflowRunStatus =
    failedCount === 0 ? "completed" : failedCount === stepResults.length ? "failed" : "completed_with_errors";

  const run = await prisma.workflowRun.create({
    data: {
      workflowKey: params.definition.key,
      status,
      steps: JSON.stringify(stepResults),
      correlationId: correlationId ?? null,
      finishedAt: new Date(),
    },
  });

  logger.info(`workflow run ${status}: ${params.definition.key}`, {
    runId: run.id,
    stepCount: stepResults.length,
    failedCount,
  });

  return { runId: run.id, status, steps: stepResults };
}
