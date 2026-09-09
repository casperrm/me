/**
 * Section 29: "Metric definitions live in a governed metrics catalog so
 * revenue, profit, ROAS, CPA, health scores, utilization, etc. have one
 * definition."
 *
 * These are the metrics whose formulas were previously duplicated or
 * inline-only in the services that compute them (apps/web's
 * profitability-service.ts, apps/worker's health-scores.ts job) and are
 * genuinely non-trivial enough to be worth a single shared definition —
 * not a one-line sum. Both callers now import from here, so a formula
 * change happens in exactly one place. See docs/specs/metrics-catalog.md
 * for which metrics are NOT unified this way, and why.
 */

export function computeMarginPct(profitCents: number, revenueCents: number): number | null {
  // Null, never 0% or NaN, when there's no revenue to take a percentage of.
  return revenueCents > 0 ? (profitCents / revenueCents) * 100 : null;
}

export const HEALTH_SCORE_BASE = 100;

export const TASK_OVERDUE_PENALTY_PER_TASK = 5;
export const TASK_OVERDUE_PENALTY_CAP = 25;

export function overdueTaskPenalty(overdueTaskCount: number): number {
  return Math.min(overdueTaskCount * TASK_OVERDUE_PENALTY_PER_TASK, TASK_OVERDUE_PENALTY_CAP);
}

export const PROJECT_OVERDUE_PENALTY_PER_PROJECT = 10;
export const PROJECT_OVERDUE_PENALTY_CAP = 20;

export function overdueProjectPenalty(overdueProjectCount: number): number {
  return Math.min(overdueProjectCount * PROJECT_OVERDUE_PENALTY_PER_PROJECT, PROJECT_OVERDUE_PENALTY_CAP);
}

export const INVOICE_OVERDUE_PENALTY_PER_INVOICE = 15;
export const INVOICE_OVERDUE_PENALTY_CAP = 30;

export function overdueInvoicePenalty(overdueInvoiceCount: number): number {
  return Math.min(overdueInvoiceCount * INVOICE_OVERDUE_PENALTY_PER_INVOICE, INVOICE_OVERDUE_PENALTY_CAP);
}

export const APPROVAL_LATENCY_WARN_HOURS = 24;
export const APPROVAL_LATENCY_WARN_PENALTY = 5;
export const APPROVAL_LATENCY_CRITICAL_HOURS = 72;
export const APPROVAL_LATENCY_CRITICAL_PENALTY = 10;

export function approvalLatencyPenalty(averageTurnaroundHours: number): number {
  if (averageTurnaroundHours > APPROVAL_LATENCY_CRITICAL_HOURS) return APPROVAL_LATENCY_CRITICAL_PENALTY;
  if (averageTurnaroundHours > APPROVAL_LATENCY_WARN_HOURS) return APPROVAL_LATENCY_WARN_PENALTY;
  return 0;
}

export const QC_FAIL_RATE_PENALTY_MULTIPLIER = 20;

export function qcFailRatePenalty(failRate: number): number {
  return Math.round(failRate * QC_FAIL_RATE_PENALTY_MULTIPLIER);
}

export function clampHealthScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export const MEETING_GAP_WARN_DAYS = 45;
export const MEETING_GAP_WARN_PENALTY = 5;
export const MEETING_GAP_CRITICAL_DAYS = 90;
export const MEETING_GAP_CRITICAL_PENALTY = 10;

/**
 * `null` means no client-scoped meeting has ever been recorded — treated
 * as no penalty (0), not the worst case. This matches this file's own
 * existing convention (see `approvalLatencyPenalty`/`qcFailRatePenalty`'s
 * callers in apps/worker/src/jobs/health-scores.ts: zero recent decisions
 * or zero recent QC checks are never treated as evidence of a problem)
 * — absence of tracked data isn't evidence of a real gap, and a client
 * onboarded before the Meetings module existed, or one this system
 * simply hasn't logged a meeting for yet, shouldn't be penalized for
 * that alone.
 */
export function meetingCadencePenalty(daysSinceLastMeeting: number | null): number {
  if (daysSinceLastMeeting === null) return 0;
  if (daysSinceLastMeeting > MEETING_GAP_CRITICAL_DAYS) return MEETING_GAP_CRITICAL_PENALTY;
  if (daysSinceLastMeeting > MEETING_GAP_WARN_DAYS) return MEETING_GAP_WARN_PENALTY;
  return 0;
}
