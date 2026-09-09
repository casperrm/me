# Module: Client Health Score

Status: **Implemented (Phase 5 slice)**. Bible reference: Section 4.2
("Compute an explainable Client Health Score from configurable signals
such as delivery delays, unresolved issues, approval latency, payment
status, campaign trends, communication gaps, satisfaction signals, and
renewal proximity. ... Scores are decision support, not autonomous
truth.").

## Purpose

Turn "is this client relationship healthy?" from a manual guess into a
number backed by real, already-collected data — and, critically, one a
person can see the reasoning behind, not a black box.

## Scope boundary — stated explicitly

Section 4.2 lists eight example signal categories. Five have real,
already-collected data behind them in this system:

| Bible signal | Built as | Real data source |
|---|---|---|
| Delivery delays | `delivery_delays_tasks`, `delivery_delays_projects` | `Task`/`Project.dueDate` vs now |
| Payment status | `payment_status` | `Invoice.dueAt`/`.status` |
| Approval latency | `approval_latency` | Real `Approval.createdAt` timestamps (requested → decided) |
| Unresolved issues | `unresolved_issues_qc` | Quality Control failures (`QualityCheckResult`) on recent creative versions — the closest real proxy this system has to "issues" |
| Communication gaps | `meeting_cadence` | `Meeting.occurredAt` (Section 13, added in a follow-up slice once the Meetings module existed) — see the honest caveat below |

**`meeting_cadence` is a partial, honest cut of "communication gaps,"
not the full thing.** It measures days since the client's last recorded
*meeting* — a real signal, not fabricated — but this system still has
no messaging/call-log model, so anything that happens over email, chat,
or a phone call that isn't logged as a `Meeting` is invisible to it. A
client a team talks to constantly over email but rarely holds a formal
meeting with would show a stale cadence here despite genuinely good
communication. That's a real limitation, named here rather than
glossed over — full communication tracking remains unbuilt.

**Still not built, and never faked:** campaign trends (needs real
performance metric ingestion — Phase 4), satisfaction signals (no
CSAT/NPS model exists), renewal proximity (no contract/renewal-date
model exists). A health score that silently invented numbers for these
would be worse than not having them — Section 4.2 itself says "Scores
are decision support, not autonomous truth," which only holds if every
number behind it is real.

"Configurable" (Section 4.2's own word) is also only partially true here:
weights are fixed constants in `apps/worker/src/jobs/health-scores.ts`
today, not a per-organization configuration surface. That's a reasonable
next increment once real usage shows which weights need adjusting — not
guessed at up front.

## The signals and their weights

Starting from 100, each signal subtracts a capped penalty:

- **`delivery_delays_tasks`**: `min(overdueTaskCount * 5, 25)`
- **`delivery_delays_projects`**: `min(overdueProjectCount * 10, 20)`
- **`payment_status`**: `min(overdueUnpaidInvoiceCount * 15, 30)` — weighted
  heaviest, matching Section 4.2 naming payment status explicitly and
  it being the signal with the clearest business consequence.
- **`approval_latency`**: bucketed from the average hours between an
  `Approval("requested")` and its resolving decision over the last 90
  days — `>72h` → 10, `>24h` → 5, else 0.
- **`unresolved_issues_qc`**: `round(qcFailRate * 20)`, where
  `qcFailRate` is the share of the client's 20 most-recently-checked
  creative versions whose latest `QualityCheckResult.overallStatus` was
  `fail`.
- **`meeting_cadence`**: 10 if it's been more than 90 days since the
  client's last recorded (client-scoped, already-occurred — a
  future-scheduled meeting never counts) meeting, 5 if more than 45, else
  0. A client with **no** meeting on record at all also scores 0 here —
  absence of tracked data is never treated as evidence of a real gap,
  the same convention `approval_latency` and `unresolved_issues_qc`
  already follow for "no recent decisions"/"no recent checks."

Final score is clamped to `[0, 100]`. Every signal — including ones with
zero penalty — is always returned in `factors`, so "nothing wrong here"
is stated, not just omitted.

## Entities

No schema change was needed — `ClientHealthScore` (`score`, `factors`
JSON, `computedAt`) already existed in the schema, previously only ever
populated by the seed script. This slice is the first thing that
actually computes and writes real rows into it, and — because
`computedAt` is a timestamp, not a unique key — each run inserts a new
row rather than overwriting the last one, preserving history for future
trend analysis.

## The job (`apps/worker/src/jobs/health-scores.ts`)

`computeHealthScoreForClient(clientId)` does the real work; `runHealthScoreJob()`
loops every `Client` in the database and inserts one `ClientHealthScore`
row each. Registered in `apps/worker/src/index.ts` as a third BullMQ
queue, `health-scores`, daily, with `immediately: true` (same reasoning
as the escalations job: a worker restart shouldn't leave scores stale
for up to a day).

## UI

The client profile page's existing health badge (previously just a bare
number) is now a `<details>`/`<summary>` element — click to expand and
see every signal's value and penalty, each with a `title` tooltip
explanation. No JavaScript needed for the expand/collapse; it degrades
to just the number if `factors` is empty (e.g. no score computed yet).

## Permissions

Computation runs as an internal worker job with no actor — it reads
every client in the database each cycle, the same "no auth needed for a
trusted internal batch job" pattern as the escalation scan. The read
side is unchanged: the client profile page already required
`clients:read` before this slice and still does.

## Jobs

The `health-scores` queue, daily. See `docs/specs/notifications.md` for
the sibling `escalations` job this pattern was established with.

## Failure modes

- **A client with zero data** (no tasks, invoices, approvals, or QC
  checks): scores 100, with every factor explicitly showing "0
  overdue," "no recent decisions," etc. — a fair "no evidence of
  problems" default, not silence.
- **A paid invoice past its due date**: correctly excluded from the
  payment-status penalty — only `status != "PAID"` invoices count,
  verified directly in the integration tests.
- **Extreme cases** (many overdue items at once): score floors at 0,
  never negative.

## Acceptance tests

- `apps/worker/src/jobs/health-scores.integration.test.ts` — 10 tests
  against real Postgres (new `apps/worker/vitest.config.ts`, pinned to
  `cedarpoint_test` — mirrors `apps/web`'s config): a clean client
  scores 100 with every factor at zero penalty (now including
  `meeting_cadence`), overdue tasks and projects are penalized
  correctly, an overdue unpaid invoice is penalized while a paid one
  past its due date is not, a Quality Control failure penalizes the
  `unresolved_issues_qc` signal, a client with no meeting on record
  scores zero penalty for `meeting_cadence`, a client whose last real
  meeting was 120 days ago is penalized (a future-scheduled meeting in
  the same window is correctly ignored) while one whose last meeting
  was yesterday is not, the score never goes below 0 under an extreme
  case, `runHealthScoreJob` creates exactly one new row per existing
  client, and re-running it preserves history (inserts, never
  overwrites).
- `packages/metrics/src/formulas.test.ts` — `meetingCadencePenalty`
  gained 4 dedicated tests: no meeting on record returns 0, within the
  45-day warn threshold returns 0, between 45 and 90 days returns the
  warn penalty, beyond 90 days returns the critical penalty.
- Manual smoke test performed for this slice: ran the actual
  `apps/worker` process against real Redis and Postgres, confirmed the
  health-scores job fired immediately on startup and correctly scored
  the seeded demo client (85 = 100 − 15 for its one overdue unpaid
  invoice, every other factor including `meeting_cadence` at 0, since
  the seeded client had no meeting on record), then confirmed the
  client profile page rendered the score and its expandable factor
  breakdown correctly; dev database reset to a clean seeded state and
  Redis flushed afterward.
- Manual smoke test performed for this follow-up slice: created a real
  client-scoped meeting dated 100 days in the past through the running
  server's API, re-ran the real health-scores job, confirmed via `psql`
  that the resulting `ClientHealthScore` row's `factors` JSON showed a
  real `meeting_cadence` penalty of 10 and the score reduced
  accordingly, then confirmed the client profile page's expandable
  factor breakdown rendered the new signal with its real explanation
  text; the test meeting and the extra `ClientHealthScore` rows it
  caused were deleted afterward.
