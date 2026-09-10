import { isAuthorized } from "@cedar/auth";
import { Card, StatCard } from "@/components/Card";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { getAiSupervisorSummary, getModelUsageBreakdown, listRecentWorkerJobFailures } from "@/lib/services/ai-supervisor-service";
import { getRecentEvalRuns } from "@/lib/services/eval-service";
import { getAiBudgetStatus } from "@/lib/services/ai-budget-service";
import { getPromptSnapshots } from "@/lib/services/prompt-registry-service";
import { MODEL_CATALOG } from "@/lib/model-catalog";
import { RunEvalButton } from "./RunEvalButton";
import { SetAiBudgetForm } from "./SetAiBudgetForm";

export const dynamic = "force-dynamic";

export default async function AiSupervisorPage() {
  // Org-wide AI usage/failure/cost visibility is oversight-level, same
  // spirit as audit:read — not something every Command Center user needs.
  const { allowed, actor } = await checkPermission("ai:supervise");
  if (!allowed || !actor) {
    return <PermissionDenied message="AI Supervisor telemetry requires the ai:supervise permission. Ask an admin or owner." />;
  }

  const [summary, evalRuns, budgetStatus, canManageBudget, promptSnapshots, modelUsage, workerJobFailures] = await Promise.all([
    getAiSupervisorSummary(actor.organizationId),
    getRecentEvalRuns(),
    getAiBudgetStatus(actor.organizationId),
    isAuthorized({ userId: actor.user.id, organizationId: actor.organizationId, permission: "organization:manage" }),
    getPromptSnapshots(),
    getModelUsageBreakdown(actor.organizationId),
    listRecentWorkerJobFailures(),
  ]);
  const latestEvalRun = evalRuns[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Supervisor</h1>
        <p className="text-sm text-neutral-500">
          Real telemetry from every Cedar Brain call (Section 6.3) — success rate, latency, token usage, and
          user-flagged incorrect responses. A real evaluation score now exists for Cedar Brain&apos;s routing logic (see
          below) — retry count and tool-failure count are still not shown because no retry logic or tool-calling
          exists yet to count.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total requests" value={String(summary.totalRequests)} />
        <StatCard
          label="Success rate"
          value={summary.successRatePct !== null ? `${summary.successRatePct.toFixed(0)}%` : "—"}
          hint={`${summary.successCount} ok, ${summary.failureCount} failed`}
        />
        <StatCard
          label="Avg latency"
          value={summary.avgLatencyMs !== null ? `${Math.round(summary.avgLatencyMs)}ms` : "—"}
        />
        <StatCard label="Live vs stub" value={`${summary.liveCount} / ${summary.stubCount}`} hint="requests answered by a real model call vs. stub" />
        <StatCard label="Input tokens" value={summary.totalInputTokens.toLocaleString()} />
        <StatCard label="Output tokens" value={summary.totalOutputTokens.toLocaleString()} />
        <StatCard label="Flagged incorrect" value={String(summary.flaggedIncorrectCount)} hint="user corrections" />
      </div>

      <Card title="Recent failures">
        {summary.recentFailures.length === 0 ? (
          <p className="text-sm text-neutral-400">No failed requests recorded.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {summary.recentFailures.map((f) => (
              <li key={f.id} className="border-b border-neutral-50 pb-2 last:border-0">
                <div className="text-xs text-neutral-400">{f.createdAt.toLocaleString()}</div>
                <div className="text-neutral-700">{f.promptExcerpt}</div>
                <div className="text-xs text-red-600">{f.errorMessage}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recently flagged incorrect">
        {summary.recentFlagged.length === 0 ? (
          <p className="text-sm text-neutral-400">No responses flagged incorrect.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {summary.recentFlagged.map((f) => (
              <li key={f.id} className="border-b border-neutral-50 pb-2 last:border-0">
                <div className="text-xs text-neutral-400">
                  {f.flaggedAt?.toLocaleString()} — flagged by {f.flaggedByName ?? "unknown"}
                </div>
                <div className="text-neutral-700">{f.promptExcerpt}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Evaluation harness"
        action={<RunEvalButton />}
      >
        <p className="mb-3 text-xs text-neutral-500">
          A real, deterministic regression suite for Cedar Brain&apos;s routing logic (Section 6.3/33) — 10 golden-set
          cases, run on demand, checked against what actually routed. See docs/specs/ai-eval-harness.md for exactly
          what this does and does not cover (no live-response quality scoring yet — see that doc for why).
        </p>
        {evalRuns.length === 0 ? (
          <p className="text-sm text-neutral-400">No eval runs yet — click &quot;Run eval now&quot;.</p>
        ) : (
          <div className="space-y-4">
            {latestEvalRun && (
              <div className="rounded-lg border border-neutral-100 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Latest run — {latestEvalRun.passedCases}/{latestEvalRun.totalCases} passed
                  </span>
                  <span className="text-xs text-neutral-400">{latestEvalRun.createdAt.toLocaleString()}</span>
                </div>
                {latestEvalRun.passedCases < latestEvalRun.totalCases && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {latestEvalRun.results
                      .filter((r) => !r.passed)
                      .map((r) => (
                        <li key={r.id} className="text-red-600">
                          {r.caseName}: expected {r.expected}, got {r.actual}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Run history</h4>
              <ul className="space-y-1 text-xs text-neutral-500">
                {evalRuns.map((run) => (
                  <li key={run.id} className="flex justify-between">
                    <span>{run.createdAt.toLocaleString()}</span>
                    <span className={run.passedCases === run.totalCases ? "text-cedar-700" : "text-red-600"}>
                      {run.passedCases}/{run.totalCases}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card title="AI budget">
        {budgetStatus.monthlyTokenLimit === null ? (
          <p className="text-sm text-neutral-400">
            No monthly token budget set — live Cedar Brain requests are unrestricted.
          </p>
        ) : (
          <div className="text-sm">
            <div className="flex items-center justify-between">
              <span>Used this month</span>
              <span className={budgetStatus.overBudget ? "font-medium text-red-600" : ""}>
                {budgetStatus.usedTokensThisMonth.toLocaleString()} / {budgetStatus.monthlyTokenLimit.toLocaleString()}{" "}
                tokens
              </span>
            </div>
            {budgetStatus.overBudget && (
              <p className="mt-1 text-xs text-red-600">
                Budget exceeded — live Cedar Brain requests are blocked until next month.
              </p>
            )}
          </div>
        )}
        {canManageBudget ? (
          <SetAiBudgetForm currentLimit={budgetStatus.monthlyTokenLimit} />
        ) : (
          <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
            Only an owner or admin (organization:manage) can change this.
          </p>
        )}
      </Card>

      <Card title="Prompt version history">
        <p className="mb-3 text-xs text-neutral-500">
          The real system prompt text behind each `promptVersion` label recorded on Cedar Brain requests — read-only,
          auto-captured the first time each version is used (Section 33; see docs/specs/cedar-prompt-registry.md).
        </p>
        {promptSnapshots.length === 0 ? (
          <p className="text-sm text-neutral-400">No prompt version has been used yet.</p>
        ) : (
          <ul className="space-y-2">
            {promptSnapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <details className="group rounded-lg border border-neutral-100 p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
                    <span className="font-medium">{snapshot.promptVersion}</span>
                    <span className="text-xs text-neutral-400">{snapshot.recordedAt.toLocaleString()}</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-600">{snapshot.template}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Model routing policy">
        <p className="mb-3 text-xs text-neutral-500">
          A real, static catalog of 3 model tiers and a deterministic selection rule based on how many agents
          `routeToAgents()` matched (Section 33 — see docs/specs/model-catalog.md). This is an honest, bounded
          first cut: breadth of routing is a real, already-computed complexity signal, not the live-response
          quality evaluation Section 33&apos;s own wording asks for — that would need a rubric-based LLM-judge
          harness, which docs/specs/ai-eval-harness.md documents as not built.
        </p>
        <ul className="mb-4 space-y-2">
          {MODEL_CATALOG.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-neutral-100 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{entry.label}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide text-neutral-500">
                  {entry.tier}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-neutral-400">{entry.id}</div>
              <p className="mt-1 text-xs text-neutral-600">{entry.notes}</p>
            </li>
          ))}
        </ul>
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Actual usage (this organization)
          </h4>
          {modelUsage.length === 0 ? (
            <p className="text-sm text-neutral-400">No Cedar Brain requests recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-neutral-500">
              {modelUsage.map((bucket) => (
                <li key={bucket.modelName ?? "null"} className="flex justify-between">
                  <span className={bucket.modelName ? "font-mono" : "italic"}>
                    {bucket.modelName ?? "not recorded (pre-catalog)"}
                  </span>
                  <span>{bucket.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Background job health">
        <p className="mb-3 text-xs text-neutral-500">
          Section 18.2&apos;s dead-letter visibility: every scheduled apps/worker job (escalations, health scores,
          the AI eval harness) now retries up to 3 times with backoff before a run counts as failed. This lists
          runs that exhausted every retry, deployment-wide (not scoped to this organization, since a scheduled job
          isn&apos;t tied to one tenant).
        </p>
        {workerJobFailures.length === 0 ? (
          <p className="text-sm text-neutral-400">No job has exhausted its retries.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {workerJobFailures.map((failure) => (
              <li key={failure.id} className="rounded-lg border border-neutral-100 p-3">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>
                    {failure.queueName} / {failure.jobName} — {failure.attemptsMade} attempt(s)
                  </span>
                  <span>{failure.occurredAt.toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-red-600">{failure.errorMessage}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
