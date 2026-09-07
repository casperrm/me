# ADR-007: AI provider gateway / model routing

- **Status:** Proposed — thin implementation exists, full scope deferred
- **Date:** 2026-09-06
- **Updated:** 2026-09-06 — added real AI Supervisor telemetry (Section
  6.3); see `docs/specs/ai-supervisor.md`.
- **Updated:** 2026-09-07 — added a real evaluation harness for
  `routeToAgents()` (Section 6.3/33); see
  `docs/specs/ai-eval-harness.md`. Still no evaluation of the live
  model call's actual output — see that doc for why.
- **Updated:** 2026-09-07 — added real per-agent output structure
  within the existing single API call (Section 4/6.1); see
  `docs/specs/cedar-brain-per-agent-output.md`. Deliberately did NOT
  move to one API call per agent — see that doc for why.
- **Updated:** 2026-09-07 — added real AI budget governance at the
  organization level (Section 33); see
  `docs/specs/ai-budget-governance.md`. This is the specific mechanism
  the per-agent-output update above cited as missing — it closes that
  blocker without itself reopening the per-agent-fan-out decision.
- **Updated:** 2026-09-07 — added a real, auto-captured, read-only
  prompt version registry (Section 33); see
  `docs/specs/cedar-prompt-registry.md`. Deliberately NOT a
  live-editable admin UI — see that doc for the multi-tenancy risk that
  ruled it out.

## Context

Bible Section 6.1/33 describes Cedar Brain's orchestration lifecycle and
requires prompt/model versioning, cost governance, and evaluation before
this is a real "AI gateway." `packages/ai` is currently an empty
placeholder; a working stub lives in `apps/web/src/lib/cedar-brain.ts`.

## Decision (current, interim)

- `routeToAgents()` — a keyword classifier, not a model call — decides
  which named specialist agents (marketing, design, video, localization,
  campaign, quality_control) a request touches.
- `callCedarBrain()` makes one direct call to the Anthropic API
  (`claude-sonnet-5`) with those agent names in the system prompt, or
  returns a deterministic stub if `ANTHROPIC_API_KEY` is unset. Every
  request is logged to `CedarBrainRequest` regardless of mode.
- No prompt/model version registry (see the registry update below for
  what *is* built), no *true* per-agent specialization (separate calls
  with separate specialist prompts — see the per-agent update below
  for what *is* built instead), no evaluation of the live model call's
  actual output, no cost tracking beyond what's implicit in the
  Anthropic API response.
- **Update:** every request (success or failure) now writes a
  `CedarBrainRequest` row with its real mode, model name, a manually-
  bumped prompt version constant, measured latency, success/error
  outcome, and — for a live call — the actual input/output token counts
  from the Anthropic response's `usage` field. A new `/command/supervisor`
  page (gated on a new `ai:supervise` permission) surfaces real
  aggregates: success rate, average latency, live/stub split, token
  totals, recent failures, and responses a user has flagged incorrect
  (Section 6.3's "user corrections" signal). See
  `docs/specs/ai-supervisor.md` for the exact scope boundary — this is
  real telemetry over real calls, not the prompt registry or
  cost-threshold alerting Section 33 still asks for.
- **Update:** `routeToAgents()` — the one fully deterministic part of
  Cedar Brain — now has a real evaluation harness: a 10-case golden
  set, run on demand from `/command/supervisor`, persisted as
  `AiEvalRun`/`AiEvalResult` rows. Verifying the golden set against
  real output (rather than hand-deriving expectations from the same
  code being tested) found and fixed a real bug: `routeToAgents` used
  substring matching, so `"ad"` matched inside `"already"`/
  `"administrator"` and `"script"` matched inside `"description"` —
  fixed with word-boundary regex matching. See
  `docs/specs/ai-eval-harness.md`. The live model call's actual output
  is still not evaluated — that needs a rubric-based LLM-judge harness,
  a materially bigger and separately-scoped undertaking.
- **Update:** `callCedarBrain()`'s single API call now asks the model
  to structure its own response into labeled per-agent sections, parsed
  into real `plan[]` entries the Command Center UI renders (previously
  `plan[].output` was always `null` in live mode, and the UI never
  rendered `plan[]` at all — real structure that existed in the data
  model was silently thrown away at both ends). A true per-agent
  fan-out (one API call per routed agent, each with a specialist
  prompt) was considered and explicitly rejected: it would multiply
  real API spend per request, and the budget/cost-governance mechanism
  below doesn't exist yet, so there's no safety net for that spend.
  See `docs/specs/cedar-brain-per-agent-output.md`.
- **Update:** organization-level budget enforcement now exists —
  `AiBudget`, `getAiBudgetStatus`, and a real 402 block in
  `/api/cedar-brain/route.ts` before any live-mode spend once an
  explicitly-configured monthly token limit is exceeded, plus a
  deduplicated alert to `ai:supervise` holders (Section 33's
  "cost-threshold alerting," previously flagged as missing in
  `ai-supervisor.md`). See `docs/specs/ai-budget-governance.md`. Still
  organization-level only, not per-user/workflow/provider — see below.
- **Update:** `SYSTEM_PROMPT_TEMPLATE` (the static instructional part
  of the system prompt) is now a real, named export, and
  `ensurePromptSnapshotRecorded` auto-captures the actual text under
  each `CEDAR_BRAIN_PROMPT_VERSION` label the first time it's used —
  "trace a quality regression to a specific prompt revision" now means
  reading the real historical text, on `/command/supervisor`, not just
  a version string. Deliberately read-only: no route or UI lets any
  organization's admin edit the live prompt, since that prompt is
  shared across every organization on the deployment and a mutable
  editor would let one org silently change behavior for all of them.
  See `docs/specs/cedar-prompt-registry.md`. This is the other item the
  section below had named as still needed — a *model* catalog/routing
  policy is not part of it and remains open.

## What this ADR will need to decide when AI Foundation (Phase 3) is built

- Model routing policy and a real model catalog (Section 33: "route
  tasks to the least expensive model that meets quality requirements")
  — the prompt-version half of "prompt/model version registry" now
  exists (see the update above); the model-catalog half does not.
- Finer-grained budget enforcement (per-user/workflow/provider, not
  just per-organization — the organization-level mechanism now exists,
  see the update above).
- Whether this stays a direct-to-Anthropic integration or gains a
  provider-abstraction layer for multi-provider routing.

## Consequences of deferring

The interim stub is honest about its limits in its own code comments and
in `ROADMAP.md` Phase 3 — nothing downstream should assume Cedar Brain
output has been evaluated, versioned, or cost-tracked yet.
