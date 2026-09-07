import { Card, StatCard } from "@/components/Card";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { getAiSupervisorSummary } from "@/lib/services/ai-supervisor-service";
import { getRecentEvalRuns } from "@/lib/services/eval-service";
import { RunEvalButton } from "./RunEvalButton";

export const dynamic = "force-dynamic";

export default async function AiSupervisorPage() {
  // Org-wide AI usage/failure/cost visibility is oversight-level, same
  // spirit as audit:read — not something every Command Center user needs.
  const { allowed, actor } = await checkPermission("ai:supervise");
  if (!allowed || !actor) {
    return <PermissionDenied message="AI Supervisor telemetry requires the ai:supervise permission. Ask an admin or owner." />;
  }

  const [summary, evalRuns] = await Promise.all([
    getAiSupervisorSummary(actor.organizationId),
    getRecentEvalRuns(),
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
    </div>
  );
}
