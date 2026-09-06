# Module: AI Business Advisor

Status: **Implemented (Phase 5 slice)**. Bible reference: Section 16.2
("Explain profitability, identify cost leakage, unprofitable
engagements, strong services, capacity risks, collection risks, and
evidence-backed upsell opportunities. Recommendations must expose
assumptions and underlying metrics").

## Purpose

Turns signals that already existed separately across the app
(profitability, expenses, task assignments, invoices, Opportunity
Engine) into one combined "what does the business need to know right
now" briefing on the CEO Dashboard, instead of requiring the owner to
mentally cross-reference five different screens.

## Architecture — two layers, deliberately separated

1. **`business-advisor-service.ts`** (`getBusinessAdvisorBriefing`) —
   the real data layer. Every field is a literal aggregate over
   already-collected data: no signal is invented, and nothing here
   depends on an AI call succeeding.
2. **`business-advisor-narrative.ts`** (`generateBusinessAdvisorNarrative`)
   — an optional prose wrapper around exactly that data, following the
   same live/stub pattern Cedar Command Center already uses
   (`cedar-brain.ts`): no `ANTHROPIC_API_KEY` means a deterministic
   plain-language summary assembled directly from the numbers (still
   fully real, just not polished prose); a key present means Claude
   turns the same JSON into a tighter narrative, under an explicit
   system-prompt instruction not to introduce any number, name, or
   claim beyond what was given. The UI always renders the raw
   underlying data alongside the narrative — Section 16.2's "expose
   assumptions and underlying metrics" is satisfied structurally, not
   just by prompt instruction.

## The six signals

- **Unprofitable engagements**: clients from `getClientProfitability`
  (`profitability-service.ts`, unchanged) with `profitCents < 0`,
  worst-first.
- **Cost leakage**: `Expense` grouped by category, org-wide, ranked by
  share of total spend (attributed + unattributed combined — this is
  about where money goes, not client attribution).
- **Strong services**: a `Client.services` tag counted only when at
  least 2 clients share it (same evidence discipline as the
  Opportunity Engine's `MIN_PEER_COUNT`), reporting how many of those
  clients are actually profitable versus the total.
- **Capacity risks**: team members (`Membership`, via `Task.assigneeId`)
  with at least 5 open (non-`done`) tasks or at least 3 overdue ones —
  thresholds chosen as a first reasonable cut, not configurable yet.
- **Collection risks**: real overdue unpaid invoices (`dueAt < now`,
  `status != PAID`), grouped by client with count and total amount —
  the same query shape as the Client Health Score's payment-status
  signal, applied at the org level here.
- **Upsell rollup**: loops `getOpportunitiesForClient` (Opportunity
  Engine, unchanged) across every client in the organization and
  counts how many distinct clients share each gap, surfacing the
  strongest cross-client signals first.

## Scope boundary — stated explicitly

- **No new AI judgment.** The narrative is prose *of* the computed
  data, never a second source of claims — this preserves the same
  "decision support, not autonomous truth" discipline as Client Health
  Score and the Opportunity Engine.
- **Capacity risk is task-count only.** It has no notion of task size,
  hours, or actual working capacity — there's no time-tracking or
  effort-estimation model in this system. "5+ open tasks" is a coarse
  proxy, not a real workload calculation.
- **Cost leakage is categorical, not root-cause.** It reports which
  expense category is largest, not *why* — no anomaly detection or
  budget-variance comparison exists.
- **No trend data anywhere in this briefing** — every number is a
  point-in-time snapshot from `getBusinessAdvisorBriefing`'s current
  call, matching the rest of Phase 5's explicit avoidance of fabricated
  trend lines.

## Permissions

Same as the rest of the CEO Dashboard — `getBusinessAdvisorBriefing`
itself does no authorization (takes an already-authorized
`organizationId`, matching `profitability-service.ts`'s pattern); the
Dashboard page gates the whole page on `finance:read`.

## UI

CEO Dashboard (`/dashboard`): a new "AI Business Advisor" card below
the existing Client Profitability table. Header badge reads "AI
narrative" or "Deterministic summary — set ANTHROPIC_API_KEY for AI
narrative" so it's always clear which mode produced the text. Below the
narrative, all six signal categories render as explicit lists (client
names link to their profile), so nothing in the narrative is
unverifiable.

## Failure modes

- **No data for a signal** (e.g. no overloaded team member): renders an
  explicit "None." / "No overdue unpaid invoices." message — the
  narrative's stub mode says the same thing in prose rather than
  omitting the topic, so an empty section always reads as "checked and
  clean," never as "not computed."
- **Anthropic API error**: `generateBusinessAdvisorNarrative` throws
  rather than silently falling back to the stub — a live-mode failure
  should be visible, not masked as if it were the deterministic path.

## Acceptance tests

- `apps/web/src/lib/services/business-advisor.integration.test.ts` — 6
  tests against real Postgres: identifies the one unprofitable client
  with its exact profit figure; ranks cost leakage by category share;
  surfaces a strong service only once 2+ clients share it and counts
  only the profitable ones; flags an overloaded team member (6 open, 4
  overdue tasks) while leaving a lightly-loaded one unflagged; reports
  an overdue unpaid invoice as a collection risk while confirming a
  paid invoice is excluded; rolls up the one real cross-client upsell
  gap in the fixture.
- Manual smoke test performed for this slice against the real running
  server: confirmed the CEO Dashboard's new "AI Business Advisor" card
  rendered in deterministic-summary mode (no `ANTHROPIC_API_KEY` set in
  this environment) with correct real cost-leakage percentages and a
  correct real overdue-invoice collection risk for the seeded data. All
  smoke-test requests were read-only — no dev database mutation.
