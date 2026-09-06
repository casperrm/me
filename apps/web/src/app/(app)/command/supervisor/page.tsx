import { Card, StatCard } from "@/components/Card";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { getAiSupervisorSummary } from "@/lib/services/ai-supervisor-service";

export const dynamic = "force-dynamic";

export default async function AiSupervisorPage() {
  // Org-wide AI usage/failure/cost visibility is oversight-level, same
  // spirit as audit:read — not something every Command Center user needs.
  const { allowed, actor } = await checkPermission("ai:supervise");
  if (!allowed || !actor) {
    return <PermissionDenied message="AI Supervisor telemetry requires the ai:supervise permission. Ask an admin or owner." />;
  }

  const summary = await getAiSupervisorSummary(actor.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Supervisor</h1>
        <p className="text-sm text-neutral-500">
          Real telemetry from every Cedar Brain call (Section 6.3) — success rate, latency, token usage, and
          user-flagged incorrect responses. No evaluation score, retry count, or tool-failure count is shown here
          because none of those have a real data source yet.
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
    </div>
  );
}
