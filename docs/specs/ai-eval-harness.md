# Module: AI Evaluation Harness (Section 6.3/33)

Status: **Implemented (routing evaluation only)**. Closes a gap the AI
Supervisor's own code explicitly flagged: `ai-supervisor-service.ts`'s
top comment said "no evaluation score... because none of those have a
real data source yet in this system (no eval harness...)". This slice
gives Cedar Brain's routing logic a real one.

## Why routing, and not live-response quality

Cedar Brain (`cedar-brain.ts`) has two genuinely different parts:

1. **`routeToAgents(prompt)`** — a pure, fully deterministic function.
   Given the same prompt, it always returns the same agent list. This
   can be evaluated for real, with a real pass/fail answer, with no
   API calls, no flakiness, and no need for an LLM to judge another
   LLM's output.
2. **The actual model call** (`callCedarBrain`) — either a stub (also
   deterministic, but trivially so — it just echoes the routed
   agents) or a real Anthropic API call, whose output is natural
   language with no single correct answer. Evaluating *that* for real
   needs either a rubric-based LLM-judge harness (flaky, costs real
   API calls on every run, needs careful prompt design to avoid the
   judge itself being wrong) or hand-labeled golden responses (doesn't
   generalize to new prompts). That's a materially bigger, riskier
   undertaking than this slice, and building it without a live
   feedback loop from real usage risks producing a rubric nobody would
   trust. **Explicitly deferred, not silently skipped** — the AI
   Supervisor page's comment now says exactly this instead of
   pretending it doesn't exist.

So this harness evaluates routing only. That's a real, meaningful
piece of "evaluation score" — a routing regression (someone edits
`AGENT_KEYWORDS` and breaks a previously-correct case) is now something
the system can catch mechanically, rather than only being caught by a
human noticing the Command Center suddenly routing something to the
wrong specialist.

## A real bug this harness found and fixed immediately

Building the golden set required verifying every case's expected
output against the *actual* routing logic (via a throwaway Node
script, not by hand-tracing keyword matches) before writing a single
test assertion — and that surfaced a real bug: `routeToAgents` matched
keywords with plain `.includes()`, i.e. substring matching, not word
matching. Two concrete false positives this caused:

- The `video` keyword `"script"` matched inside **"de-SCRIPT-ion"** —
  any prompt asking for a product **description** was silently routed
  to the video agent.
- The `marketing` keyword `"ad"` matched inside **"already"** and
  **"administrator"** — extremely common words in an agency's actual
  request text, given `"ad"` is a two-letter keyword.

Fixed by switching to word-boundary regex matching (`\bkeyword\b`),
with one deliberate exception: `"localiz"` stays a **prefix** match
(no trailing boundary) since it's intentionally designed to catch
localize/localization/localizing with one keyword — the one case in
the list that isn't a complete word. See
`apps/web/src/lib/cedar-brain.ts`'s `matchesKeyword` for the fix and
its comment explaining exactly why `"localiz"` is the one exception.

This is exactly what an evaluation harness is *for*: the golden set's
own cases (written independently of the implementation, using an
agency employee's plain-language judgment of what should happen) is
what caught this, not a hand-written unit test targeting the bug after
the fact.

## The golden set

`apps/web/src/lib/services/eval-service.ts`'s `ROUTING_GOLDEN_SET` — 10
cases. Each is a prompt an agency employee would independently agree on
the right specialist(s) for, deliberately written to avoid
incidentally triggering an unrelated keyword (the exercise of writing
these cleanly, and verifying them against real output before trusting
them, is what surfaced the substring bug above). Covers: each of the
six agent types individually, a genuinely multi-domain prompt (video +
design + the marketing keyword it happens to also contain), the
"no keyword matched → default to marketing" fallback rule, and the
`"localiz"` prefix-match behavior.

## How a run works

`runRoutingEval()` runs every golden-set case against the real
`routeToAgents`, compares actual vs. expected as sets (order doesn't
matter — `routeToAgents` iterates `Object.keys()` in a fixed order,
but that's an implementation detail the eval shouldn't be coupled to),
and persists one `AiEvalRun` row (`suite`, `totalCases`, `passedCases`)
with one `AiEvalResult` child row per case (`caseName`, `input`,
`expected`, `actual`, `passed`).

**Not organization-scoped.** `routeToAgents` is shared code, identical
for every organization — a run's pass/fail is a system-level
engineering signal, like a build status, not tenant data. Any
`ai:supervise` holder in any organization can trigger a run
(`POST /api/eval/run`) and sees the same shared run history on
`/command/supervisor`.

## UI

`/command/supervisor` gained an "Evaluation harness" card: a "Run eval
now" button (`POST /api/eval/run`, then `router.refresh()`), the
latest run's pass/total with per-case failure detail when something
fails, and a run-history list (timestamp + pass/total, color-coded).

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors (caught and fixed one real
  unescaped-apostrophe error in the new supervisor page text).
- `apps/web/src/lib/cedar-brain.test.ts` (8 tests, no Postgres needed
  — pure function): explicit regression tests for the substring bug
  (`"description"` no longer routes to video, `"already"`/
  `"administrator"` no longer route to marketing), confirms `"ad"` and
  `"script"` still match as standalone words, confirms `"localiz"`
  still works as a prefix, confirms the fallback and multi-agent rules
  still hold.
- `apps/web/src/lib/services/eval-service.integration.test.ts` (3
  tests against real Postgres): a real run persists one result per
  golden-set case with **every case currently passing** (a genuine
  assertion the golden set is correctly authored against real output,
  not just that the harness executes), a reproduced failure case
  proves `passed: false` is computed correctly and not hardcoded true,
  and run history returns newest-first scoped to the routing suite.
- `apps/web/src/app/api/eval/run/route.contract.test.ts` (3 tests):
  401 unauthenticated, 403 for a member without `ai:supervise`
  (verified against a real DESIGNER membership, which gets no
  organization-wide permissions per `ROLE_GLOBAL_PERMISSIONS`), 200
  with a real persisted run for an OWNER.
- Full `apps/web` vitest suite: 172/172 passing across 30 files (158
  before this slice + 14 new).
- `npm run build --workspace=@cedar/web`: succeeds; `/api/eval/run`
  and the updated `/command/supervisor` both compile.
- **Live smoke test against the real running server and the seeded dev
  database, with a direct-SQL cross-check**: confirmed the supervisor
  page showed "No eval runs yet" before any run existed, triggered a
  real run via `POST /api/eval/run` as the seeded owner (`{"ok":true,
  "totalCases":10,"passedCases":10}`), confirmed the supervisor page
  then rendered "Latest run — 10/10 passed" for that exact run, and
  cross-checked directly against Postgres
  (`select suite, totalCases, passedCases from ai_eval_runs` → one row,
  `10 / 10`; `ai_eval_results` → 10 rows). The eval run was deleted
  afterward, restoring the dev database to a clean state.

## Scope boundary — stated explicitly

- **Live-response quality is not evaluated** — see "Why routing, and
  not live-response quality" above. A rubric-based LLM-judge harness
  for `callCedarBrain`'s actual output is real, valuable, separately-
  scoped follow-up work.
- **No CI/scheduled automatic runs** — the harness runs on demand via
  the "Run eval now" button. Wiring it into `apps/worker` as a
  scheduled job (so a routing regression is caught even if no one
  clicks the button) is a real, small follow-up, not built here to
  keep this slice's scope to "the harness exists and works," which is
  the actual gap that was open.
- **10 cases, not exhaustive** — the golden set proves the pattern and
  covers every agent type at least once; growing it as new routing
  cases matter is ordinary, expected maintenance, not a gap in this
  slice.

## Acceptance

- `packages/db/prisma/schema.prisma` — `AiEvalRun`/`AiEvalResult`
  models, migration `20260907062829_add_ai_eval_harness`.
- `apps/web/src/lib/cedar-brain.ts` — word-boundary keyword matching
  (bug fix).
- `apps/web/src/lib/services/eval-service.ts` — golden set + harness.
- `apps/web/src/app/api/eval/run/route.ts` — trigger endpoint.
- `apps/web/src/app/(app)/command/supervisor/page.tsx` and
  `RunEvalButton.tsx` — UI.
- `apps/web/src/lib/cedar-brain.test.ts`,
  `apps/web/src/lib/services/eval-service.integration.test.ts`,
  `apps/web/src/app/api/eval/run/route.contract.test.ts` — 14 tests.
