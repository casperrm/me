# ADR-007: AI provider gateway / model routing

- **Status:** Proposed — thin implementation exists, full scope deferred
- **Date:** 2026-09-06

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
- No prompt/model version registry, no per-agent specialization, no
  evaluation harness, no cost tracking beyond what's implicit in the
  Anthropic API response.

## What this ADR will need to decide when AI Foundation (Phase 3) is built

- Model routing policy (Section 33: "route tasks to the least expensive
  model that meets quality requirements").
- Prompt/model version registry so `AIRequest`/`AgentRun` records (Section
  3's domain model) can cite exactly what produced a given output.
- Per-user/workflow/provider budget enforcement (Section 33).
- Whether this stays a direct-to-Anthropic integration or gains a
  provider-abstraction layer for multi-provider routing.

## Consequences of deferring

The interim stub is honest about its limits in its own code comments and
in `ROADMAP.md` Phase 3 — nothing downstream should assume Cedar Brain
output has been evaluated, versioned, or cost-tracked yet.
