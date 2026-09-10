# Cedar Decision Engine v1: Client Renewal Recommendation

- **Status:** Implemented (first cut; a second decision type added below)
- **Bible section:** 20 (Cedar Decision Engine)
- **Date:** 2026-09-10

## What Section 20 asks for

> For important decisions, aggregate relevant operational, performance,
> financial, client, and historical evidence. Return recommendation,
> alternatives, reasons, risks, assumptions, expected impact, and required
> approvals. The authorized human makes the final decision.

Section 20's own worked example names "Client renewal" as a decision type,
with exactly this evidence list: *profitability, health score, delivery
history, results, payment behavior, opportunity*. Every one of those was
already a real, independently computed signal somewhere else in this app —
Client Health Score, `getClientProfitability`, `getOpportunitiesForClient`,
and the same overdue task/invoice queries `apps/worker/src/jobs/escalations.ts`
already uses — but nothing combined them into one structured recommendation.
This slice is that first combination, not a new capability invented from
nothing.

## What was built

`apps/web/src/lib/services/decision-engine-service.ts` exports
`getClientRenewalRecommendation(clientId, organizationId)`, which:

1. Loads the client's most recent `ClientHealthScore` (if any).
2. Loads `getClientProfitability(organizationId)` and finds this client's
   entry.
3. Counts overdue unpaid invoices and overdue tasks (same shape of query
   `escalations.ts` runs).
4. Loads cross-sell/upsell opportunities via `getOpportunitiesForClient`.
5. Turns each signal into a plain-English evidence line, and — only when
   the signal is actually concerning — a risk line with a numeric weight.
6. Sums the weights into a `riskScore` and maps it to one of three calls:
   `"renew"`, `"at_risk"`, `"do_not_renew"`.
7. Returns `{ recommendation, evidence, risks, assumptions,
   requiresApproval: true }`.

`requiresApproval: true` is not a UI label — there is no write path in this
function or anywhere downstream of it that acts on the recommendation.
Section 20's "the authorized human makes the final decision" is structural
here: the function only ever reads and returns data.

### Deterministic, not AI-generated

Same "decision support, not autonomous truth" stance as Client Health Score
and the AI Business Advisor: no model call. This works identically whether
or not `ANTHROPIC_API_KEY` is set, and is fully unit-testable against real
Postgres data with no stubbing.

### Never fabricates missing evidence

A client with no `ClientHealthScore` row gets the honest evidence line
`"No Client Health Score has been computed yet."`, never a guessed score.

The profitability case needed one extra step: `getClientProfitability`
returns a zeroed `ClientProfitability` entry (`revenueCents: 0, costCents: 0,
marginPct: null`) for **every** client in the org, including ones with no
invoices or expenses at all — it never returns `null` for an existing
client. Treating that zeroed entry as real data would have shown a
misleading "Profitability: $0.00" line for a brand-new client. The service
instead treats `revenueCents === 0 && costCents === 0` as "nothing recorded
yet" and shows the same honest "No profitability data recorded" line the
health-score branch uses, reserving the real `$X.XX (Y% margin)` line for a
client that has actually invoiced or been billed against.

### UI

`apps/web/src/app/(app)/clients/[id]/page.tsx`'s Client 360 page now renders
a "Renewal recommendation" card above the existing Opportunities card:
a colored badge (`renew`/`at_risk`/`do_not_renew`), the evidence list, a
red risks list (only shown when non-empty), and a collapsible `<details>`
listing the assumptions — matching the same disclosure pattern already used
elsewhere on this page (e.g. Brand DNA's collapsible sections).

## Scoring

```
RENEW_MAX_SCORE = 0      // riskScore <= 0  -> "renew"
AT_RISK_MAX_SCORE = 2    // riskScore <= 2  -> "at_risk"
                          // riskScore > 2   -> "do_not_renew"
```

Weights: critical health score (<50) = 2, below-healthy health score
(50-69) = 1, unprofitable = 2, any overdue unpaid invoice = 1, any overdue
task = 1. These thresholds are a first cut, not a tuned model — see
Assumptions below.

## Explicit scope boundary (what this deliberately does NOT do)

The `assumptions` array returned by the function states these directly to
every reader of the recommendation, not just in this doc:

- No model of strategic relationship value, contract terms, or market
  conditions — a human deciding a real renewal must still weigh those.
- Client Health Score itself already excludes campaign performance,
  satisfaction signals, and renewal proximity (see
  `docs/specs/client-health.md`) — so this recommendation inherits that
  same gap.
- No "alternatives" or "expected impact" fields yet, even though Section 20
  lists them — there is no real alternatives-generation or impact-modeling
  capability anywhere in this codebase to draw from yet, and fabricating
  either would violate the "never invent data" rule this whole system is
  built on. `evidence`, `risks`, `assumptions`, and `requiresApproval` are
  the fields this slice can honestly fill; `recommendation` stands in for
  Section 20's "alternatives" as the single real recommendation this system
  currently supports (renew / at-risk / do-not-renew), not a ranked list.
- Two decision types now: "Client renewal" and "Hiring/capacity" (below).
  Section 20's other two worked examples — "Campaign budget" (needs
  historical CPA/ROAS, i.e. real ad-platform performance data this system
  doesn't have — no `PerformanceSnapshot` model, no live connector) and
  "System improvement" (built separately as Cedar Innovation Lab v1, see
  `docs/specs/cedar-innovation-lab.md`) — are either blocked on missing
  external data or already covered elsewhere. Building "Campaign budget"
  now would mean fabricating the performance numbers Section 20's own
  evidence column names.

## Second decision type: Hiring/capacity

`getHiringCapacityRecommendation(organizationId)` — Section 20's third
worked decision type: *"workload, deadlines, utilization, pipeline,
service demand."* Unlike Client Renewal, this reuses an **existing**
service wholesale rather than re-querying: `getBusinessAdvisorBriefing`
(Section 16.2's AI Business Advisor, already shipped) had already computed
`capacityRisks` (per-member open/overdue task counts) and `upsellRollup`
(Opportunity Engine's cross-client demand rollup) — both already displayed
raw on the CEO Dashboard. This is the same synthesis this whole module
does: turning already-real, already-displayed numbers into one structured
go/no-go call instead of leaving a human to eyeball a list.

Recommendation logic: `strainedRatio = (# team members over the capacity
threshold) / (# active team members)`. `>= 50%` → `"hire"`; any strain but
under 50% → `"monitor"`; none → `"no_action_needed"`.

**Explicit scope boundary**, stated in the returned `assumptions` (not
just this doc): "pipeline" is omitted entirely — this codebase has no
lead/deal-stage concept at all (it's an agency delivery system, not a
CRM), so there's no real data to report, and inventing a fake pipeline
metric was never on the table. "Utilization" is not a measured
hours/percentage either; the task-count proxy `capacityRisks` already used
is named honestly as a proxy, not relabeled as something more precise.

### UI

New "Hiring & capacity recommendation" card on the CEO Dashboard
(`/dashboard`, same `finance:read` gate as the rest of the page),
placed directly after the existing "AI Business Advisor" card whose
`capacityRisks`/`upsellRollup` it reuses. Same badge/evidence/risks/
assumptions layout as the Client Renewal card, for visual consistency
across both decision types.

### Tests

`decision-engine.integration.test.ts` gained a new
`describe("getHiringCapacityRecommendation")` block (4 tests, 9 total in
the file). Each test uses its own isolated organization — `capacityRisks`
and the active-member count are org-wide aggregates, so sharing one
organization across scenarios (as the Client Renewal tests do) would let
one test's fixture members skew another's strained-ratio math:

- No strained members → `"no_action_needed"`, zero risks.
- 1 of 3 active members strained (33%) → `"monitor"`.
- 2 of 2 active members strained (100%) → `"hire"`, both named in `risks`.
- `requiresApproval` always `true`; assumptions state the real
  pipeline/utilization scope boundary, not a generic placeholder.

### Verification performed (this addition)

- `npx tsc --noEmit` on `apps/web` and every workspace: clean.
- `npx eslint`: clean.
- Full `apps/web` vitest suite: 622/622 passed (95 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15
  packages.
- Production build (`next build`): succeeded.
- Live smoke test against a real running production build: confirmed the
  honest baseline first (`"No action needed"`, real seeded org has 1
  active member with no task strain), then inserted 5 real open tasks for
  that member directly via Postgres, reloaded `/dashboard`, and confirmed
  the card correctly switched to `"Consider hiring"` with the real task
  count in evidence and risks — screenshot-verified. Fixture tasks deleted
  afterward and the dashboard confirmed back to the honest baseline.

## Tests

`apps/web/src/lib/services/decision-engine.integration.test.ts` — 5 tests
against real Postgres (`cedarpoint_test`), no mocking (pure Prisma module,
same pattern as `opportunity-service.integration.test.ts`):

- Healthy, profitable, no-overdue-signal client -> `"renew"`, zero risks.
- Below-healthy score alone -> `"at_risk"`.
- Critical health score + unprofitable + overdue invoice + overdue task
  combined -> `"do_not_renew"` with all four risk lines present.
- Brand-new client with neither a health score nor any financial history
  -> both "no data" evidence lines, `"renew"` (no negative signal recorded
  means nothing to flag).
- `requiresApproval` is always `true` and `assumptions` is always non-empty.

## Verification performed

- `npx tsc --noEmit` on `apps/web` and every workspace: clean.
- `npx eslint` on the new/changed files: clean.
- Full `apps/web` vitest suite: 596/596 passed (92 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15 packages.
- Production build (`next build`): succeeded, `/clients/[id]` route built.
- Live smoke test: real dev server, real login, real seeded client (Volt
  Mobile, health score 82, one overdue $2,500 invoice) → the card rendered
  the correct "At risk" badge, the real evidence lines (including
  "Client Health Score: 82/100", "Profitability: $2,500.00 (100% margin)",
  the overdue-invoice evidence and risk lines), and the collapsible
  assumptions section — screenshot-verified, no error boundary triggered.
  Confirmed via `ps`/log inspection that no stale server process from an
  earlier smoke test was still bound to the port before treating the
  result as real (see prior slices' postmortems on this exact class of
  false positive).
