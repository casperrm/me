export interface MetricDefinition {
  id: string;
  label: string;
  category: "finance" | "client_health" | "operations";
  unit: "currency_cents" | "percent" | "count" | "score_0_100";
  description: string;
  formula: string;
  /** Where this metric is actually computed, so the definition below is traceable to real code. */
  computedIn: string[];
  /** Set when a shared pure function in formulas.ts is the single real definition, not just documentation. */
  governedBy?: string;
}

/**
 * Section 29's governed metrics catalog. Every entry here reflects a
 * metric this system actually computes today from real data — nothing
 * aspirational, no placeholder ROAS/CPA/utilization entries with no
 * backing computation. See docs/specs/metrics-catalog.md for the exact
 * scope boundary: which metrics are enforced as one shared formula
 * (`governedBy` set) versus documented-only because the underlying
 * computation is a one-line aggregation query, and which named-but-real
 * metrics (ROAS, CPA, utilization) have no entry at all because no
 * connector or time-tracking data exists yet to compute them from.
 */
export const METRICS_CATALOG: MetricDefinition[] = [
  {
    id: "revenue_paid",
    label: "Revenue (paid)",
    category: "finance",
    unit: "currency_cents",
    description: "Recognized revenue — money actually collected, not invoiced or pending.",
    formula: "Sum of Invoice.amountCents where status = PAID.",
    computedIn: [
      "apps/web/src/lib/services/profitability-service.ts (per client)",
      "apps/web/src/app/(app)/dashboard/page.tsx (organization-wide)",
    ],
  },
  {
    id: "expenses_total",
    label: "Expenses",
    category: "finance",
    unit: "currency_cents",
    description: "All recorded costs, whether attributed to a client or general overhead.",
    formula: "Sum of Expense.amountCents.",
    computedIn: [
      "apps/web/src/lib/services/profitability-service.ts (per client + unattributed)",
      "apps/web/src/app/(app)/dashboard/page.tsx (organization-wide)",
    ],
  },
  {
    id: "net",
    label: "Net",
    category: "finance",
    unit: "currency_cents",
    description: "Revenue minus expenses for the organization.",
    formula: "revenue_paid − expenses_total.",
    computedIn: ["apps/web/src/app/(app)/dashboard/page.tsx"],
  },
  {
    id: "client_profit",
    label: "Client profit",
    category: "finance",
    unit: "currency_cents",
    description: "Profit attributable to one client.",
    formula: "Client's revenue_paid − client's attributed expenses (Expense.clientId = this client).",
    computedIn: ["apps/web/src/lib/services/profitability-service.ts"],
  },
  {
    id: "client_margin_pct",
    label: "Client margin",
    category: "finance",
    unit: "percent",
    description: "Client profit as a percentage of client revenue. Null (shown as \"—\") when the client has no revenue — a percentage of nothing isn't meaningful.",
    formula: "client_profit ÷ revenue_paid × 100, or null when revenue_paid is 0.",
    computedIn: ["apps/web/src/lib/services/profitability-service.ts"],
    governedBy: "computeMarginPct",
  },
  {
    id: "client_health_score",
    label: "Client Health Score",
    category: "client_health",
    unit: "score_0_100",
    description:
      "Explainable health score starting at 100 and reduced by real delivery, payment, approval-latency, quality-control, and meeting-cadence signals. Decision support, not autonomous truth (Section 4.2).",
    formula: "100 − (overdue-task penalty + overdue-project penalty + overdue-invoice penalty + approval-latency penalty + QC-fail-rate penalty + meeting-cadence penalty), clamped to [0, 100].",
    computedIn: ["apps/worker/src/jobs/health-scores.ts"],
    governedBy: "clampHealthScore",
  },
  {
    id: "overdue_task_penalty",
    label: "Overdue task penalty",
    category: "client_health",
    unit: "score_0_100",
    description: "Health score deduction from tasks past their due date and not marked done.",
    formula: "min(overdue task count × 5, 25).",
    computedIn: ["apps/worker/src/jobs/health-scores.ts"],
    governedBy: "overdueTaskPenalty",
  },
  {
    id: "overdue_project_penalty",
    label: "Overdue project penalty",
    category: "client_health",
    unit: "score_0_100",
    description: "Health score deduction from projects past their due date and not delivered or archived.",
    formula: "min(overdue project count × 10, 20).",
    computedIn: ["apps/worker/src/jobs/health-scores.ts"],
    governedBy: "overdueProjectPenalty",
  },
  {
    id: "overdue_invoice_penalty",
    label: "Overdue invoice penalty",
    category: "client_health",
    unit: "score_0_100",
    description: "Health score deduction from invoices past their due date and not yet paid.",
    formula: "min(overdue unpaid invoice count × 15, 30).",
    computedIn: ["apps/worker/src/jobs/health-scores.ts"],
    governedBy: "overdueInvoicePenalty",
  },
  {
    id: "approval_latency_penalty",
    label: "Approval latency penalty",
    category: "client_health",
    unit: "score_0_100",
    description: "Health score deduction from slow approval turnaround over the last 90 days.",
    formula: "10 if average turnaround > 72h, else 5 if > 24h, else 0.",
    computedIn: ["apps/worker/src/jobs/health-scores.ts"],
    governedBy: "approvalLatencyPenalty",
  },
  {
    id: "qc_fail_rate_penalty",
    label: "Quality Control fail-rate penalty",
    category: "client_health",
    unit: "score_0_100",
    description: "Health score deduction from the share of the last 20 creative versions' Quality Control checks that failed.",
    formula: "round(QC fail rate × 20), over the most recent 20 checks.",
    computedIn: ["apps/worker/src/jobs/health-scores.ts"],
    governedBy: "qcFailRatePenalty",
  },
  {
    id: "meeting_cadence_penalty",
    label: "Meeting cadence penalty",
    category: "client_health",
    unit: "score_0_100",
    description:
      "Health score deduction from how long it's been since the client's last recorded meeting. A partial, honest proxy for Section 4.2's \"communication gaps\" signal — not full communication tracking (no messaging/call-log model exists, see docs/specs/client-health.md). A client with no meeting on record yet is never penalized for that alone; absence of tracked data isn't evidence of a real gap.",
    formula: "10 if days since last meeting > 90, else 5 if > 45, else 0. 0 if no meeting has ever been recorded.",
    computedIn: ["apps/worker/src/jobs/health-scores.ts"],
    governedBy: "meetingCadencePenalty",
  },
];
