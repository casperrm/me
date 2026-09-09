// Cedar Brain's routing logic (Section 4) — the one fully deterministic,
// non-Anthropic-dependent part of Cedar Brain. Moved here from
// apps/web/src/lib/cedar-brain.ts so a second real consumer
// (apps/worker's scheduled AI eval job — see ../eval.ts) can call it
// without apps/worker importing from apps/web, a module boundary this
// codebase has otherwise always respected (apps/worker only ever depends
// on packages/*). Everything Anthropic-call-specific (callCedarBrain,
// buildSystemPrompt, parsePerAgentSections, SYSTEM_PROMPT_TEMPLATE, model
// selection, prompt-version registry, budget governance) deliberately
// stays in apps/web/src/lib/cedar-brain.ts — see
// docs/adr/0007-ai-provider-gateway.md's dated log for why only this
// piece moved.
export type CedarAgent =
  | "marketing"
  | "design"
  | "video"
  | "localization"
  | "campaign"
  | "quality_control";

const AGENT_KEYWORDS: Record<CedarAgent, string[]> = {
  marketing: ["campaign", "hook", "offer", "promote", "ad", "advertise", "launch"],
  design: ["design", "creative", "visual", "logo", "banner", "carousel", "graphic"],
  video: ["video", "reel", "storyboard", "script", "voice-over", "edit"],
  localization: ["translate", "localiz", "arabic", "french", "spanish", "language"],
  campaign: ["budget", "kpi", "ads manager", "meta", "tiktok ads", "google ads", "spend"],
  quality_control: ["review", "check", "qc", "quality", "proofread"],
};

// "localiz" is a deliberate stem (matches localize/localization/localizing)
// — every other keyword is a complete word or phrase and gets matched on a
// word boundary at both ends, so it can't fire as a mid-word substring (a
// real bug the AI Evaluation Harness caught: plain .includes() matching
// meant "script" matched inside "de-SCRIPT-ion" and "ad" matched inside
// "already"/"administrator" — see docs/specs/ai-eval-harness.md).
const PREFIX_KEYWORDS = new Set(["localiz"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(lowerPrompt: string, keyword: string): boolean {
  const trailingBoundary = PREFIX_KEYWORDS.has(keyword) ? "" : "\\b";
  const pattern = new RegExp(`\\b${escapeRegExp(keyword)}${trailingBoundary}`);
  return pattern.test(lowerPrompt);
}

export function routeToAgents(prompt: string): CedarAgent[] {
  const lower = prompt.toLowerCase();
  const matched = (Object.keys(AGENT_KEYWORDS) as CedarAgent[]).filter((agent) =>
    AGENT_KEYWORDS[agent].some((kw) => matchesKeyword(lower, kw)),
  );
  // Every request that reaches Cedar Brain should at least touch marketing
  // strategy and get a QC pass before it's considered "done" (Section 23).
  if (matched.length === 0) matched.push("marketing");
  if (!matched.includes("quality_control")) matched.push("quality_control");
  return matched;
}
