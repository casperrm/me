# Module: AI Budget Governance (Section 33)

Status: **Implemented**. Closes a gap two prior specs explicitly
flagged: `ai-supervisor.md`'s scope boundary said "no cost-threshold
alerting yet," and `cedar-brain-per-agent-output.md` named "Section
33's budget/cost-governance mechanism doesn't exist yet" as the exact
reason true per-agent API fan-out was rejected in that slice.

## What this closes, and what it doesn't

This gives an organization a real, enforced monthly token budget for
Cedar Brain's live-mode calls — the actual mechanism previously missing.
It does **not**, by itself, reopen the per-agent-fan-out decision from
`cedar-brain-per-agent-output.md`: that would still be its own separate
slice (deciding a sane default multiplier, UI for per-agent cost
visibility, etc.). What this slice does is remove the *specific*
blocker that decision cited — a budget mechanism now exists to bound
runaway spend, whatever design consumes it next.

## Design principle: never fabricate a default

An organization with no `AiBudget` row has **unrestricted** live Cedar
Brain usage — exactly the behavior before this module existed. No
default token limit is ever silently applied. A budget only exists,
and only enforces anything, once an owner or admin explicitly sets one
via `/command/supervisor`.

## The mechanism

- **`AiBudget`** (schema) — one row per organization
  (`organizationId @unique`), a single `monthlyTokenLimit: Int`.
- **`getAiBudgetStatus(organizationId)`** — computes real usage from
  `CedarBrainRequest` (the same table AI Supervisor telemetry already
  writes to) summed over the current UTC calendar month, `mode: "live"`
  requests only (stub mode has zero real cost, so it's excluded from
  usage — and, separately, never blocked). Returns
  `{ monthlyTokenLimit, usedTokensThisMonth, remainingTokens, overBudget, periodStart }`.
- **`setAiBudget(...)`** — `organization:manage`-gated (the same
  permission tier as inviting members or revoking connections — a
  spend limit is an organizational decision, not an AI-oversight one).
  `monthlyTokenLimit: null` removes the budget entirely (back to
  unrestricted), not "set it to zero." A non-positive limit is rejected
  with a real validation error.
- **Enforcement, in `/api/cedar-brain/route.ts`**: before routing or
  calling the model, if `ANTHROPIC_API_KEY` is set (i.e. a live call
  would actually cost money) *and* the organization is over budget,
  the request is rejected with **402** and a clear error — before
  `routeToAgents`, before `callCedarBrain`, before any real API spend.
  No `CedarBrainRequest` row is written for a blocked request (nothing
  happened to log). Stub mode is never blocked, at any usage level —
  blocking a $0 stub response would provide no protection and only
  frustrate testing when no API key is configured.
- **`alertIfOverBudget(organizationId)`** — the actual "cost-threshold
  alerting" gap. Notifies every active member with `ai:supervise`
  (the same permission that gates `/command/supervisor`) via the
  existing Notification system (Section 30), deduplicated to once per
  24 hours per organization (`hasRecentNotification`, the same
  "don't spam on every poll" pattern `apps/worker`'s escalation job
  already uses) rather than once per blocked request.

## UI

`/command/supervisor` gained an "AI budget" card: current usage vs.
limit (or "No monthly token budget set — live Cedar Brain requests are
unrestricted" when none exists), a red "Budget exceeded" notice when
over, and — for `organization:manage` holders only — a form to set or
clear the limit. Someone without that permission sees a note saying so
instead of the form, not a hidden or broken control.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- `apps/web/src/lib/services/ai-budget-service.integration.test.ts` (7
  tests against real Postgres): no default budget when none is set;
  `AuthorizationError` for a DESIGNER lacking `organization:manage`;
  rejection of a zero/negative limit; real usage computed correctly
  from a mix of live-mode (counted), stub-mode (not counted, zero real
  cost), and *last month's* live-mode (outside the current billing
  period, not counted) `CedarBrainRequest` rows; `overBudget` flips
  true exactly at the limit; clearing the budget returns to
  unrestricted; `alertIfOverBudget` notifies the real `ai:supervise`
  holder (not the DESIGNER, who has no organization-wide permissions)
  exactly once, with a second call deduplicated.
- `apps/web/src/app/api/ai-budget/route.contract.test.ts` (6 tests):
  401, 400 for a non-numeric/non-null limit, 403 for a member without
  `organization:manage`, 400 for the real service's own positive-number
  validation, 200 with a real persisted row, 200 removing the row when
  set to `null`.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` gained one
  new test: with a real over-budget `AiBudget` row and prior usage in
  place, and `ANTHROPIC_API_KEY` stubbed on for just this one test
  (`vi.stubEnv`, cleaned up in a `finally`), the route returns 402 and
  — critically — **no new `CedarBrainRequest` row is written**, proving
  the block happens before any work, real or stub, occurs. No real
  network call happens either, since the route returns before
  `callCedarBrain` is ever invoked.
- Full `apps/web` vitest suite: 196/196 passing across 33 files (182
  before this slice + 14 new, 6 from ai-budget-service integration
  minus overlap... concretely: 7 + 6 + 1 = 14 new tests).
- `npm run build --workspace=@cedar/web`: succeeds; `/api/ai-budget`
  and the updated `/command/supervisor` (612 B → 1.03 kB) both compile.
- **Live smoke test against the real running server and the seeded dev
  database, with a direct-SQL cross-check**: logged in as the seeded
  owner, set a real 5,000-token budget via `POST /api/ai-budget`,
  confirmed the real `ai_budgets` row and that `/command/supervisor`
  rendered "Used this month 0 / 5,000 tokens." Inserted one real
  live-mode `CedarBrainRequest` row (3,000 input + 2,500 output tokens)
  via direct SQL, reloaded the page, and confirmed it now rendered
  "5,500 / 5,000 tokens" in red with the "Budget exceeded" notice —
  exact arithmetic match. The actual 402-blocking HTTP path could not
  be smoke-tested against the real server, since `ANTHROPIC_API_KEY` is
  unset in this environment (as established in every prior live-mode
  verification this session) — that path is covered by the route-
  contract test's `vi.stubEnv` approach instead, documented here as an
  honest scope boundary rather than worked around. All smoke-test rows
  (the budget, the request, and any notification) were deleted
  afterward, restoring the dev database's original state.

## Scope boundary — stated explicitly

- **Monthly only.** No daily/weekly granularity, no per-client or
  per-user sub-budgets within an organization — Section 33's ask is
  satisfied at the organization level; finer-grained budgets are real,
  separately-scoped follow-up work if ever needed.
- **Token-based, not dollar-based** — consistent with AI Supervisor's
  existing choice (`docs/specs/ai-supervisor.md`) to use real token
  counts rather than a computed dollar figure that would need a
  hardcoded, staleness-prone price.
- **No graduated warnings** (80%/90% thresholds) — a single binary
  over/under-budget signal. Real, useful, and simple; a graduated
  system is real follow-up work if a flat cutoff proves too abrupt in
  practice.
- **Does not itself change the per-agent-fan-out decision** — see
  "What this closes, and what it doesn't" above.

## Acceptance

- `packages/db/prisma/schema.prisma` — `AiBudget` model, migration
  `20260907065731_add_ai_budget`.
- `apps/web/src/lib/services/ai-budget-service.ts` — the core module.
- `apps/web/src/app/api/ai-budget/route.ts` — set/clear endpoint.
- `apps/web/src/app/api/cedar-brain/route.ts` — enforcement wired in.
- `apps/web/src/app/(app)/command/supervisor/page.tsx` and
  `SetAiBudgetForm.tsx` — UI.
- `apps/web/src/lib/services/ai-budget-service.integration.test.ts`,
  `apps/web/src/app/api/ai-budget/route.contract.test.ts`, and a new
  test in `apps/web/src/app/api/cedar-brain/route.contract.test.ts` —
  14 new tests total.
