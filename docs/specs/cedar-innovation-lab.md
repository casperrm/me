# Cedar Innovation Lab v1: Telemetry-Driven Improvement Backlog

- **Status:** Implemented (first cut)
- **Bible sections:** 21 (Cedar Innovation Lab and Evolution AI), 6.4 (Cedar
  Intelligence), 20 (Cedar Decision Engine's "System improvement" row)
- **Date:** 2026-09-10

## What Sections 21 / 6.4 / 20 ask for

Section 21:

> Periodically identify underused modules, repeated manual work, slow
> workflows, missing capabilities, integration opportunities, and relevant
> new AI/technology. Produce a prioritized innovation backlog with
> evidence, impact, effort, risk, dependencies, and suggested experiment.
> No self-deployment. Owner approval and normal engineering review are
> mandatory.

Section 6.4 asks for the same synthesis at the system level ("monitors
workflows, modules, integrations, AI quality, usage, results, operational
friction, and business performance to propose prioritized improvements").
Section 20's own Decision Engine table already names "System improvement"
as a decision type, with exactly this evidence: *usage telemetry, error
rate, latency, agent evaluation, cost, user friction*.

Every one of those signals already existed as real, independently recorded
data before this slice — `getAiSupervisorSummary`'s per-request
success/failure/latency/token counts and `flaggedIncorrect` count (Section
6.3), the AI Eval Harness's pass/fail results (Section 6.3/33), and
`WorkerJobFailure`'s exhausted-retry records (Section 18.2). All of them
were already individually visible on `/command/supervisor` as separate
cards. Nothing combined them into the prioritized, evidence-backed list
Section 21 and 6.4 both describe — a human had to notice a pattern across
several dashboard cards themselves.

## What was built

`apps/web/src/lib/services/innovation-lab-service.ts` exports
`getInnovationBacklog(organizationId)`, which queries three real signal
sources in parallel and turns each concerning pattern into a `BacklogItem
{ title, affectedModule, severity, evidence }`:

1. **Cedar Brain reliability** — from `getAiSupervisorSummary`. Flagged
   only once there's a minimum sample (5 requests) and the success rate is
   below 80%; severity scales with how far below (< 50% high, < 65%
   medium, else low).
2. **Cedar Brain routing eval regression** — from the latest `AiEvalRun`.
   Flagged whenever the most recent run has any failing case, naming each
   failing case and its expected/actual routing.
3. **Elevated user-flagged-incorrect rate** — from the same
   `getAiSupervisorSummary` call's `flaggedIncorrectCount`. Flagged once
   the sample minimum is met and the flagged rate exceeds 10%.
4. **Repeated worker job failures** — `WorkerJobFailure` rows grouped by
   `queueName/jobName` within the last 7 days. Flagged once a specific job
   has failed at least twice in that window (a genuine repeat, not a
   one-off) — a single recent failure, or a failure older than 7 days,
   never counts toward this.

Items are sorted `high` → `medium` → `low`. The function returns an empty
array when nothing crosses a threshold — never a placeholder item.

### What's deliberately not included

Section 21 also asks for `impact`, `effort`, `dependencies`, and
`suggested experiment` fields. None of those have a real data source in
this codebase — no effort-estimation model, no dependency graph between
improvement candidates, no experiment-generation capability — so none are
included. Inventing numbers for them would violate this project's own
no-fabricated-data rule, the same reason `decision-engine-service.ts`
(Section 20's other decision type built so far) omits "alternatives" and
"expected impact." `severity` stands in for "risk," derived only from the
real magnitude of the underlying signal that triggered each item.

Section 21's "No self-deployment. Owner approval and normal engineering
review are mandatory" is structural here, same as the Decision Engine:
there is no write path from a backlog item to any change — this function
only reads and returns data.

### UI

`/command/supervisor` (already gated on `ai:supervise`) gained a new
"Improvement backlog" card, placed first — above the raw telemetry cards
it synthesizes — since it's the actionable summary a human should read
before the underlying detail. Each item shows a colored severity badge
(red/amber/neutral), the real affected module, and its evidence lines.

## Tests

`apps/web/src/lib/services/innovation-lab.integration.test.ts` — 7 tests
against real Postgres, no mocking beyond the standard `server-only`/
`next/headers` stubs this codebase's pattern requires wherever a pure
Prisma module transitively imports `auth-service.ts`
(`getAiSupervisorSummary` does):

- Empty backlog when nothing is concerning.
- Success-rate item appears at `high` severity for a real 20% success
  rate, with the real failure count in its evidence.
- Success-rate item does *not* appear below the minimum sample size (25%
  success rate on only 4 requests) — proving this doesn't fire on noise.
- Eval regression item appears and names the real failing case.
- Flagged-incorrect item appears at `high` for a real 50% flagged rate.
- Repeated-failure item appears for a job with 3 recent failures, while a
  failure outside the 7-day window and a one-off failure in a different
  job are both correctly excluded.
- Items sort with `high` severity first.

## Verification performed

- `npx tsc --noEmit` on `apps/web` and every workspace: clean.
- `npx eslint` on the new/changed files: clean.
- Full `apps/web` vitest suite: 603/603 passed (93 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15 packages.
- Production build (`next build`): succeeded.
- Live smoke test against a real running production build and real login:
  1. Confirmed the honest empty state first — the real dev database had
     zero `CedarBrainRequest`/`WorkerJobFailure`/`AiEvalRun` rows, and the
     card correctly rendered "No improvement candidates identified."
  2. Inserted realistic fixture telemetry directly via Postgres (2 ok + 8
     failed Cedar Brain requests, 3 repeated worker-job failures) and
     reloaded the same page — both the "Cedar Brain success rate below
     target" (high) and `"escalations/scan" job failing repeatedly`
     (medium) items rendered with correct evidence and badges,
     screenshot-verified.
  3. Deleted all fixture rows and confirmed the dev database's telemetry
     counts were back to zero before finishing.
