# Module: Governed Metrics Catalog

Status: **Implemented (Phase 5 slice)**. Bible reference: Section 29
("Metric definitions live in a governed metrics catalog so revenue,
profit, ROAS, CPA, health scores, utilization, etc. have one
definition").

## Purpose

Before this slice, the formulas behind the numbers shown across the app
(client margin, Client Health Score penalties) existed only as inline
arithmetic inside the services/jobs that displayed them — correct, but
with no single place to see or govern the definition, and no structural
guarantee two call sites couldn't quietly drift apart.

## What's actually governed vs. documented-only — stated explicitly

A metric only gets `governedBy` set in the catalog (`packages/metrics/src/catalog.ts`)
when a **shared pure function** is the one real definition, imported by
every place that computes it. That's true for:

- **`client_margin_pct`** — `computeMarginPct(profitCents, revenueCents)`,
  now the only place the margin formula is written, imported by
  `apps/web/src/lib/services/profitability-service.ts` (previously had
  the formula inlined).
- **`client_health_score`** and its six penalty sub-metrics —
  `overdueTaskPenalty`, `overdueProjectPenalty`, `overdueInvoicePenalty`,
  `approvalLatencyPenalty`, `qcFailRatePenalty`, `meetingCadencePenalty`
  (added in a follow-up slice once the Meetings module existed — see
  `docs/specs/client-health.md`), `clampHealthScore`, all now imported
  by `apps/worker/src/jobs/health-scores.ts` in place of the previous
  inline magic numbers (`Math.min(count * 5, 25)`, etc.) — same formula,
  same constants, just no longer duplicatable by accident.

**Revenue, expenses, and net are catalogued but not `governedBy`-tagged**
— they're one-line Prisma aggregation queries (`sum of Invoice.amountCents
where status = PAID`, `sum of Expense.amountCents`), computed in two
places (`profitability-service.ts` per client, the CEO Dashboard page
org-wide). Extracting a one-line sum into a shared function would need
that function to accept a Prisma client and a scope (organization vs.
client), which starts coupling a "pure formulas" package to `@cedar/db`
for no real governance benefit — the formula is already exactly as
simple as its catalog entry says. This is a real, deliberate line, not
an oversight: shared-function governance is worth it once a formula has
enough structure (thresholds, caps, multi-branch logic) that duplicating
it risks drift — a raw sum doesn't.

**Not catalogued at all — because they're not computed anywhere yet:**

- **ROAS, CPA** — need real ad-spend/conversion data from a connector
  (Meta/TikTok/Google Ads), which is Phase 4, not built.
- **Utilization** — needs time-tracking/capacity data, which has no
  model in this system yet.

Adding catalog entries for these now would be documentation for a
computation that doesn't exist — exactly what Section 29 warns against
("AI must not fabricate missing numbers," and a metric definition with
nothing behind it is the same failure mode).

## Entities

No schema changes. `packages/metrics` is a new pure-TypeScript workspace
package (`formulas.ts` for the shared functions/constants, `catalog.ts`
for `METRICS_CATALOG`), with no dependency on `@cedar/db` or any other
package — kept dependency-free so both `apps/web` and `apps/worker` can
import it without pulling in unrelated coupling.

## UI

New `/metrics` page (any authenticated organization member — these are
metric *definitions*, not client data, so there's no permission to
scope): grouped by category (Finance, Client Health), each entry shows
its label, unit, plain-language description, the literal formula string,
where it's computed, and — when governed — which shared function is the
source of truth. Linked from the app shell's left nav as "Metrics
Catalog."

## Failure modes

- **A metric with no catalog entry**: means it isn't real yet in this
  system — never silently invented for the sake of a complete-looking
  page.
- **Two call sites needing the same non-trivial formula**: must import
  the shared function from `@cedar/metrics`, not reimplement it — this
  is the governance rule going forward, enforced by convention (there's
  no build-time check preventing a new inline duplicate; that would be
  a reasonable later increment, not built here).

## Acceptance tests

- `packages/metrics/src/formulas.test.ts` — 12 unit tests covering
  every exported formula: margin (positive, negative, zero-revenue
  null), each penalty function's linear scaling and cap, approval
  latency's three bands, QC fail-rate rounding, and health-score
  clamping at both ends.
- Regression coverage: `apps/worker/src/jobs/health-scores.integration.test.ts`
  (8 tests) and `apps/web/src/lib/services/profitability.integration.test.ts`
  (5 tests) both still pass unchanged after their respective services
  were refactored to import from `@cedar/metrics` — proving the
  refactor preserved identical behavior, not just identical-looking
  code.
- Manual smoke test performed for this slice against the real running
  server: confirmed `/metrics` renders all catalog entries with correct
  formula text and shared-function attribution, confirmed the CEO
  Dashboard's profitability table and a client profile page's Health
  Score section still render correctly post-refactor, confirmed the new
  "Metrics Catalog" nav link appears. All smoke-test requests were
  read-only — no dev database mutation, so no reset was needed.
