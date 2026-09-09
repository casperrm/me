// AI gateway, agents, prompts, evals, memory retrieval (Bible Section 6,
// Phase 3). Cedar Brain itself — callCedarBrain, buildSystemPrompt,
// parsePerAgentSections, SYSTEM_PROMPT_TEMPLATE, model selection, prompt
// version registry, budget governance — deliberately stays in
// apps/web/src/lib per established Phase 3 precedent (see ADR-007's dated
// log). What moved here so far is only the fully-deterministic,
// non-Anthropic-dependent slice apps/worker's scheduled AI eval job needs
// to call without crossing the apps/worker → apps/web boundary
// apps/worker has otherwise always respected: routeToAgents/CedarAgent
// (./routing) and the routing evaluation harness (./eval).
export { routeToAgents, type CedarAgent } from "./routing";
export {
  ROUTING_EVAL_SUITE,
  ROUTING_GOLDEN_SET,
  type RoutingEvalCase,
  runRoutingEval,
  getRecentEvalRuns,
} from "./eval";
