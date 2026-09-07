// Cedar Brain (Section 4) — the single interface the rest of Cedar Point OS
// talks to. Today this is a router + a thin call to the Anthropic API; the
// real version fans work out to dedicated Marketing/Design/Video/
// Localization/Campaign/QC agents (see ARCHITECTURE.md) and merges their
// output. The routing logic below is a deliberately simple stand-in so the
// Command Center has a real, working end-to-end path to build on rather
// than a mock.

// Bumped manually whenever the system prompt below changes — the closest
// thing to a real prompt version registry until Section 33's full one
// exists (see ADR-007). Recorded on every CedarBrainRequest row so a
// quality/cost regression can be traced to a specific prompt revision.
export const CEDAR_BRAIN_PROMPT_VERSION = "v2";

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

export async function callCedarBrain(prompt: string, agents: CedarAgent[], governedContext?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      mode: "stub" as const,
      summary: `Routed to: ${agents.join(", ")}. Set ANTHROPIC_API_KEY to get a real drafted plan here instead of this stub.`,
      plan: agents.map((agent) => ({
        agent,
        output: `[stub] ${agent} would produce its part of this request here.`,
      })),
      usage: null,
    };
  }

  const systemPrompt = `You are Cedar Brain, the orchestration layer of Cedar Point OS, an AI-native
operating system for a marketing agency. A request has already been routed to
these specialist agents: ${agents.join(", ")}. Respond with what each of those
agents would produce for the request below, combined into one clear,
actionable plan a human can approve or edit. Be concrete and specific to the
request, not generic marketing filler.${
    governedContext
      ? `\n\nReal data retrieved for this request (Section 6.1 governed context — use it, don't contradict it, and don't invent facts beyond it):\n${governedContext}`
      : ""
  }`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.content?.map((block: { text?: string }) => block.text ?? "").join("\n") ?? "";

  return {
    mode: "live" as const,
    summary: text,
    plan: agents.map((agent) => ({ agent, output: null })),
    usage: data.usage
      ? { inputTokens: data.usage.input_tokens as number, outputTokens: data.usage.output_tokens as number }
      : null,
  };
}
