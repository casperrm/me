import { prisma } from "@cedar/db";
import { getAiSupervisorSummary } from "./ai-supervisor-service";
import { getRecentEvalRuns } from "./eval-service";

export type BacklogSeverity = "high" | "medium" | "low";

export interface BacklogItem {
  title: string;
  affectedModule: string;
  severity: BacklogSeverity;
  evidence: string[];
}

const MIN_SAMPLE_SIZE = 5;
const RECENT_FAILURE_WINDOW_DAYS = 7;

/**
 * Section 21 (Cedar Innovation Lab): "Periodically identify underused
 * modules, repeated manual work, slow workflows, missing capabilities,
 * integration opportunities... Produce a prioritized innovation backlog
 * with evidence, impact, effort, risk, dependencies, and suggested
 * experiment. No self-deployment." Section 6.4 (Cedar Intelligence) asks
 * for the same synthesis at the system level: "monitors workflows,
 * modules, integrations, AI quality, usage... to propose prioritized
 * improvements." Section 20's own Decision Engine table already lists
 * "System improvement" as a decision type with named evidence: "usage
 * telemetry, error rate, latency, agent evaluation, cost, user friction."
 *
 * Every one of those signals already existed as real, independently
 * recorded data before this slice — getAiSupervisorSummary's per-request
 * success/failure/latency/token counts and flaggedIncorrect count
 * (Section 6.3), the AI Eval Harness's pass/fail results (Section 6.3/33),
 * and WorkerJobFailure's exhausted-retry records (Section 18.2). This
 * function is the first thing that turns those scattered real signals
 * into the prioritized, evidence-backed list Section 21 and 6.4 both
 * describe, rather than requiring a human to notice a pattern across
 * several separate dashboard cards.
 *
 * Deliberately narrower than Section 21's full field list: `impact`,
 * `effort`, `dependencies`, and `suggested experiment` are not included.
 * None of those have a real data source in this codebase (no
 * effort-estimation model, no dependency graph between improvement
 * candidates, no experiment-generation capability) — inventing numbers
 * for them would violate this project's own no-fabricated-data rule, the
 * same reason decision-engine-service.ts omits "alternatives" and
 * "expected impact." `severity` stands in for "risk," derived only from
 * the real magnitude of each underlying signal.
 *
 * Deterministic — no model call, same "decision support, not autonomous
 * truth" stance as every other Decision Engine / Supervisor signal in
 * this app. Section 21's "No self-deployment. Owner approval and normal
 * engineering review are mandatory" is structural here too: there is no
 * write path from a backlog item to any change.
 */
export async function getInnovationBacklog(organizationId: string): Promise<BacklogItem[]> {
  const [summary, evalRuns, recentWorkerFailures] = await Promise.all([
    getAiSupervisorSummary(organizationId),
    getRecentEvalRuns(1),
    prisma.workerJobFailure.findMany({
      where: { occurredAt: { gte: new Date(Date.now() - RECENT_FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000) } },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  const items: BacklogItem[] = [];

  if (summary.totalRequests >= MIN_SAMPLE_SIZE && summary.successRatePct !== null && summary.successRatePct < 80) {
    items.push({
      title: "Cedar Brain success rate below target",
      affectedModule: "Cedar Brain (Section 6.1)",
      severity: summary.successRatePct < 50 ? "high" : summary.successRatePct < 65 ? "medium" : "low",
      evidence: [
        `${summary.failureCount} of ${summary.totalRequests} requests failed (${summary.successRatePct.toFixed(0)}% success rate) over all recorded history.`,
        ...summary.recentFailures.slice(0, 3).map((f) => `"${f.promptExcerpt}" — ${f.errorMessage ?? "no error message recorded"}`),
      ],
    });
  }

  const latestEval = evalRuns[0];
  if (latestEval && latestEval.passedCases < latestEval.totalCases) {
    const failedCases = latestEval.totalCases - latestEval.passedCases;
    items.push({
      title: "Cedar Brain routing eval regression",
      affectedModule: "Cedar Brain routing (Section 6.3/33)",
      severity: latestEval.passedCases === 0 ? "high" : failedCases >= latestEval.totalCases / 2 ? "medium" : "low",
      evidence: [
        `${failedCases} of ${latestEval.totalCases} golden-set cases failing as of the latest run (${latestEval.createdAt.toLocaleString()}).`,
        ...latestEval.results.filter((r) => !r.passed).map((r) => `${r.caseName}: expected ${r.expected}, got ${r.actual}`),
      ],
    });
  }

  if (summary.totalRequests >= MIN_SAMPLE_SIZE) {
    const flaggedRatePct = (summary.flaggedIncorrectCount / summary.totalRequests) * 100;
    if (flaggedRatePct > 10) {
      items.push({
        title: "Elevated user-flagged-incorrect rate",
        affectedModule: "Cedar Brain (Section 6.3)",
        severity: flaggedRatePct > 35 ? "high" : flaggedRatePct > 20 ? "medium" : "low",
        evidence: [
          `${summary.flaggedIncorrectCount} of ${summary.totalRequests} requests flagged incorrect by a real user (${flaggedRatePct.toFixed(0)}%).`,
        ],
      });
    }
  }

  const failuresByJob = new Map<string, typeof recentWorkerFailures>();
  for (const failure of recentWorkerFailures) {
    const key = `${failure.queueName}/${failure.jobName}`;
    const bucket = failuresByJob.get(key);
    if (bucket) bucket.push(failure);
    else failuresByJob.set(key, [failure]);
  }
  for (const [key, failures] of failuresByJob) {
    if (failures.length < 2) continue;
    items.push({
      title: `"${key}" job failing repeatedly`,
      affectedModule: "Workflow Automation Engine (Section 18)",
      severity: failures.length >= 5 ? "high" : failures.length >= 3 ? "medium" : "low",
      evidence: [
        `${failures.length} exhausted-retry failure(s) in the last ${RECENT_FAILURE_WINDOW_DAYS} days.`,
        ...failures.slice(0, 3).map((f) => f.errorMessage),
      ],
    });
  }

  const severityRank: Record<BacklogSeverity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
