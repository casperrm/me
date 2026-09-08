// Model catalog + routing policy (Section 33: "route tasks to the least
// expensive model that meets quality requirements") — the model-catalog
// half of ADR-007's "what this ADR will need to decide" list that the
// prompt-version registry slice explicitly left open. See
// docs/specs/model-catalog.md for the full scope boundary.
//
// This is a small, static, hand-maintained catalog of real, current
// Anthropic model identifiers — not fetched from any live models API
// (Anthropic doesn't expose per-model quality/cost metadata via API
// today), and not multi-provider (still Anthropic-only, matching every
// other part of Cedar Brain — see ADR-007).
import type { CedarAgent } from "./cedar-brain";

export type ModelTier = "fast" | "standard" | "premium";

export interface ModelCatalogEntry {
  id: string;
  label: string;
  tier: ModelTier;
  notes: string;
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    tier: "fast",
    notes:
      "Cheapest, fastest tier. Selected when routeToAgents() matched 2 or " +
      "fewer agents — the simplest requests Cedar Brain sees (a single " +
      "specific agent plus the mandatory quality_control pass, or only " +
      "the marketing fallback plus quality_control).",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    tier: "standard",
    notes:
      "Default, mid-cost tier. Selected when routeToAgents() matched " +
      "exactly 3 agents — a request that touches one real specialist " +
      "beyond the marketing/QC baseline, warranting more capability than " +
      "the fast tier without escalating all the way to premium.",
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    tier: "premium",
    notes:
      "Most capable, most expensive tier. Selected when routeToAgents() " +
      "matched 4 or more agents — genuinely multi-disciplinary requests " +
      "(e.g. design + video + campaign work together) where getting a " +
      "coherent, well-structured multi-section response matters more " +
      "than minimizing spend.",
  },
];

// The number of distinct agents routeToAgents() returned is the only
// real, already-computed complexity signal Cedar Brain has today.
// routeToAgents() always includes "marketing" as a fallback when no
// keyword matches, and always appends "quality_control", so the
// minimum possible length is 2 — that floor is what tier "fast" is
// anchored to below.
//
// Honesty check (see docs/specs/model-catalog.md and ADR-007): breadth
// of keyword routing is a real, non-fabricated proxy for how much a
// request spans different kinds of work — it is NOT the "quality
// requirements" Section 33's own wording asks for. A true
// quality-requirements router would need to evaluate the live model
// call's actual output against a rubric, which
// docs/specs/ai-eval-harness.md already documents as not built (only
// routing determinism is evaluated there, never live-response
// quality). This is a deliberate, bounded first cut: a real policy
// wired to a real signal, honestly scoped as partial.
export function selectModelForRequest(agents: CedarAgent[]): ModelCatalogEntry {
  const count = agents.length;
  const tier: ModelTier = count <= 2 ? "fast" : count === 3 ? "standard" : "premium";
  // MODEL_CATALOG has exactly one entry per tier by construction, so
  // this find always succeeds — the non-null assertion documents that
  // invariant rather than papering over a real possible failure.
  return MODEL_CATALOG.find((entry) => entry.tier === tier)!;
}
