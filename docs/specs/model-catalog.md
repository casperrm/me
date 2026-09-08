# Module: Model Catalog and Routing Policy (Section 33)

Status: **Implemented (static catalog, deterministic policy)**. Closes
the model-catalog half of ADR-007's "what this ADR will need to
decide" list — the item the prompt-version registry slice explicitly
left open: "Model routing policy and a real model catalog (Section 33:
'route tasks to the least expensive model that meets quality
requirements') — the prompt-version half of 'prompt/model version
registry' now exists ...; the model-catalog half does not."

## What existed before this slice

`callCedarBrain()`'s one live Anthropic call hardcoded a single literal
`model: "claude-sonnet-5"` — every live request used the same model
regardless of how simple or complex the routed work was. There was no
catalog of available models anywhere in the codebase, and
`/api/cedar-brain/route.ts` separately hardcoded `"claude-sonnet-5"` in
two places when writing `CedarBrainRequest.modelName` — once for the
success path (`result.mode === "live" ? "claude-sonnet-5" : null`,
discarding model info entirely for stub-mode requests, which is every
request in an environment with no `ANTHROPIC_API_KEY`), and once,
unconditionally, for the failure/catch path.

## What this actually builds

- **`MODEL_CATALOG`** (`apps/web/src/lib/model-catalog.ts`) — a small,
  static, hand-maintained array of 3 real, current Anthropic model
  identifiers, one per tier:

  | id | label | tier |
  |---|---|---|
  | `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | fast |
  | `claude-sonnet-5` | Claude Sonnet 5 | standard |
  | `claude-opus-5` | Claude Opus 5 | premium |

  Not fetched from any live models API (Anthropic doesn't expose
  per-model quality/cost metadata that way today) and not
  multi-provider — still Anthropic-only, matching every other part of
  Cedar Brain (see ADR-007's still-open "direct-to-Anthropic vs.
  provider-abstraction" question).

- **`selectModelForRequest(agents: CedarAgent[])`** (same file) — a
  pure, deterministic function of the *number of distinct agents
  `routeToAgents()` returned*: the only real, already-computed
  complexity signal Cedar Brain has today. `routeToAgents()` always
  includes `marketing` as a fallback when no keyword matches, and
  always appends `quality_control`, so the minimum possible length is
  2. The rule:

  - `agents.length <= 2` → **fast** (Haiku) — the simplest requests:
    one specific agent plus the mandatory QC pass, or just the
    marketing fallback plus QC.
  - `agents.length === 3` → **standard** (Sonnet).
  - `agents.length >= 4` → **premium** (Opus) — genuinely
    multi-disciplinary requests.

- **Wired into `callCedarBrain()`** — the selected model's real `id` is
  used in the live-mode Anthropic `fetch` call's `model` field
  (replacing the hardcoded literal), and the selection is returned as a
  new `modelId: string` field on *both* the stub and live return
  shapes. This is a real, useful change even in stub mode: a stub-mode
  response now tells the caller which tier *would* have been used —
  genuine telemetry, not thrown away like the old `null` was.

- **`/api/cedar-brain/route.ts`** now writes `result.modelId` (the real
  catalog-selected model) to `CedarBrainRequest.modelName` on the
  success path, in both live and stub mode. On the failure/catch path
  — where `callCedarBrain` never returned, so there's no `result` to
  read `modelId` off of — the route calls
  `selectModelForRequest(agents)` directly with the already-computed
  `agents` array; this is safe because the function is pure and
  deterministic, so it returns exactly the same tier `callCedarBrain`
  would have selected before it failed.

- Verified before making the stub-mode change safe: no consumer of
  `CedarBrainRequest.modelName` (checked
  `ai-supervisor-service.ts` and the rest of `apps/web/src`) branches
  on `modelName` being `null` to distinguish live vs. stub — that
  distinction is always made via the separate `mode` field. Recording a
  real model id in stub mode too is therefore a safe, additive change.

## Honesty about scope — this is NOT a quality-evaluated router

Section 33's own wording is "route tasks to the *least expensive model
that meets quality requirements*." Breadth of keyword routing (how many
distinct agents a request touched) is a real, non-fabricated proxy for
how much a request spans different kinds of work — it is genuinely
useful and it is genuinely already computed, unlike anything invented
for this slice. But it is **not** a measurement of output quality
requirements. A true quality-requirements router would need to evaluate
the live model call's actual output against a rubric — exactly what
`docs/specs/ai-eval-harness.md` documents as not built (that harness
only evaluates `routeToAgents()`'s routing determinism, never
live-response quality). This slice is a deliberate, bounded first cut:
a real policy wired to a real signal, honestly scoped as partial, not
a claim that model selection now reflects quality requirements.

## What this deliberately does NOT do

- **No live-response quality evaluation.** See above.
- **No multi-provider abstraction.** Still Anthropic-only.
- **No change to budget accounting.** `getAiBudgetStatus` and the 402
  enforcement in `/api/cedar-brain/route.ts` still sum raw token counts
  regardless of which model tier produced them — see
  `docs/specs/ai-budget-governance.md`. A cheaper model using fewer
  tokens is not specially credited, and a more expensive model isn't
  weighted more heavily; per-model dollar-cost governance (Haiku,
  Sonnet, and Opus tokens cost genuinely different amounts per token)
  remains open, matching ADR-007's still-open "finer-grained budget
  enforcement" item.
- **No true per-agent fan-out.** Still one Anthropic call per request
  regardless of tier — this slice changes *which* model that one call
  uses, not how many calls are made. See
  `docs/specs/cedar-brain-per-agent-output.md` for why per-agent
  fan-out remains separately scoped.
- **No admin-configurable policy.** The tier thresholds
  (`<=2`/`3`/`>=4`) are a code constant, not a per-organization
  setting — matching the read-only precedent set by the prompt
  registry (`docs/specs/cedar-prompt-registry.md`) for the same
  multi-tenancy reason: a mutable policy editable by any one
  organization's admin would change Cedar Brain's behavior for every
  organization on the deployment.

## UI

`/command/supervisor` gained a "Model routing policy" card:

- All 3 catalog entries (id, label, tier badge, notes explaining when
  that tier is selected), read directly from `MODEL_CATALOG` — no
  database round-trip needed for this part, since the catalog is a
  code constant.
- An "Actual usage (this organization)" breakdown: a real aggregate
  query (`getModelUsageBreakdown`, `prisma.cedarBrainRequest.groupBy`
  by `modelName`) rather than an unbounded `findMany` reduced in JS —
  this codebase's established Phase 7 scale-hardening convention (see
  `profitability-service.ts` for precedent). Historical rows created
  before this slice existed have `modelName: null` and are shown in
  their own honestly-labeled bucket ("not recorded (pre-catalog)") —
  never backfilled or fabricated into a fake model id.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run typecheck --workspaces`
  (whole monorepo): clean.
- `next lint`: no warnings or errors.
- New `apps/web/src/lib/model-catalog.test.ts` (8 tests, pure/
  deterministic, no database or API key needed): catalog has exactly
  one entry per tier; `selectModelForRequest` at each tier boundary
  (2 agents → fast, 1 agent → fast, 3 → standard, 4 → premium, 6 →
  premium); fed real `routeToAgents()` output end-to-end for a generic
  prompt (2 agents → fast) and a genuinely multi-domain prompt (≥4
  agents → premium).
- `apps/web/src/lib/cedar-brain.test.ts` gained 2 new tests (13 → 15):
  `callCedarBrain` in stub mode returns `modelId:
  "claude-haiku-4-5-20251001"` for a low-complexity prompt and
  `modelId: "claude-opus-5"` for a high-complexity, multi-domain
  prompt.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` gained 2
  new tests (7 → 9): the real `CedarBrainRequest.modelName` written
  through the route matches `selectModelForRequest(routeToAgents(...))`
  — not a hardcoded literal — for both a low-complexity prompt (fast
  tier) and a high-complexity one (premium tier).
- Full `apps/web` vitest suite: 512/512 passing across 83 files (500
  before this slice + 12 new: 8 in the new `model-catalog.test.ts`, 2
  in `cedar-brain.test.ts`, 2 in `route.contract.test.ts`). Full
  monorepo `npm run test --workspaces`: all workspaces passing.
- `npm run build --workspace=@cedar/web`: succeeds.
- **Live smoke test against the real running server and the seeded dev
  database**: no `ANTHROPIC_API_KEY` in this sandbox (confirmed via
  `echo $ANTHROPIC_API_KEY`), so every request ran in stub mode — the
  point of this test is the real selection logic and the real database
  write path, not the live Anthropic call, which no environment
  building this app right now can exercise. Logged in as the seeded
  owner (`consultingcedarpoint@gmail.com`). Sent `"Hello there, how are
  you?"` via a direct authenticated API call — routed to
  `["marketing", "quality_control"]` (2 agents, the `routeToAgents()`
  floor) and recorded `modelName: "claude-haiku-4-5-20251001"`. Sent
  `"We need a video storyboard, a matching banner design, and a Meta
  ads campaign with a budget and KPIs."` through the real Command
  Center UI (headless Chromium, `/opt/pw-browsers/chromium`) — routed
  to `["marketing", "design", "video", "campaign", "quality_control"]`
  (5 agents — "campaign" matched both the campaign and marketing
  keyword lists) and recorded `modelName: "claude-opus-5"`. Confirmed
  both via direct `psql` against the real `cedarpoint` dev database.
  Visited `/command/supervisor` in the same browser session and
  screenshotted it: the "Model routing policy" card rendered all 3
  catalog entries with their tier badges and notes, and the "Actual
  usage" breakdown showed exactly `claude-haiku-4-5-20251001: 1` and
  `claude-opus-5: 1` — matching the two requests just sent. Deleted
  both smoke-test `CedarBrainRequest` rows afterward and confirmed via
  `psql` that the row count returned to its pre-test value of 0. The
  pre-existing `v4` `CedarPromptSnapshot` row (recorded by an earlier
  slice) was untouched — no new snapshot was created since `v4` already
  existed. Stopped the server and confirmed via `pgrep -fa
  "next-server|next start"` that no server process remained.

## Acceptance

- `apps/web/src/lib/model-catalog.ts` — new module: `MODEL_CATALOG`,
  `selectModelForRequest`.
- `apps/web/src/lib/cedar-brain.ts` — `callCedarBrain` now returns
  `modelId` in both stub and live shapes; the live Anthropic call uses
  the selected model's real id instead of a hardcoded literal.
- `apps/web/src/app/api/cedar-brain/route.ts` — both hardcoded
  `"claude-sonnet-5"` literals replaced with the real catalog-selected
  model id.
- `apps/web/src/lib/services/ai-supervisor-service.ts` —
  `getModelUsageBreakdown`, a real `groupBy` aggregate.
- `apps/web/src/app/(app)/command/supervisor/page.tsx` — "Model
  routing policy" UI card.
- `packages/db/prisma/schema.prisma` — `CedarBrainRequest.modelName`
  comment updated to reflect that it's now populated in stub mode too
  (no migration needed — the column's type and nullability are
  unchanged).
- `apps/web/src/lib/model-catalog.test.ts` (new, 8 tests),
  `apps/web/src/lib/cedar-brain.test.ts` (+2), and
  `apps/web/src/app/api/cedar-brain/route.contract.test.ts` (+2) — 12
  new tests total.
