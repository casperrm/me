import { Card } from "@/components/Card";
import { requireActor } from "@/lib/guards";
import { METRICS_CATALOG, type MetricDefinition } from "@cedar/metrics";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<MetricDefinition["category"], string> = {
  finance: "Finance",
  client_health: "Client Health",
  operations: "Operations",
};

const UNIT_LABELS: Record<MetricDefinition["unit"], string> = {
  currency_cents: "Currency",
  percent: "Percent",
  count: "Count",
  score_0_100: "Score (0–100)",
};

export default async function MetricsCatalogPage() {
  // No permission gate beyond being an authenticated member — these are
  // metric *definitions*, not client data, so there's nothing to scope.
  await requireActor();

  const byCategory = new Map<MetricDefinition["category"], MetricDefinition[]>();
  for (const metric of METRICS_CATALOG) {
    if (!byCategory.has(metric.category)) byCategory.set(metric.category, []);
    byCategory.get(metric.category)!.push(metric);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Metrics Catalog</h1>
        <p className="text-sm text-neutral-500">
          One definition per metric (Bible Section 29) — every figure shown elsewhere in the app traces back to a
          formula here, not a one-off calculation living only where it&apos;s displayed.
        </p>
      </div>
      {Array.from(byCategory.entries()).map(([category, metrics]) => (
        <Card key={category} title={CATEGORY_LABELS[category]}>
          <ul className="divide-y divide-neutral-100">
            {metrics.map((metric) => (
              <li key={metric.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-neutral-900">{metric.label}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                    {UNIT_LABELS[metric.unit]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{metric.description}</p>
                <p className="mt-1 font-mono text-xs text-cedar-700">{metric.formula}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  Computed in: {metric.computedIn.join("; ")}
                  {metric.governedBy && ` — shared formula: ${metric.governedBy}()`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
