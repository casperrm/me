// Cedar Brain (Section 4) — the single interface the rest of Cedar Point OS
// talks to. Today this is a router + a thin call to the Anthropic API; the
// real version fans work out to dedicated Marketing/Design/Video/
// Localization/Campaign/QC agents (see ARCHITECTURE.md) and merges their
// output. The routing logic below is a deliberately simple stand-in so the
// Command Center has a real, working end-to-end path to build on rather
// than a mock.

// Bumped manually whenever SYSTEM_PROMPT_TEMPLATE below changes. Recorded
// on every CedarBrainRequest row, and — since this slice —
// ensurePromptSnapshotRecorded() captures the actual template text under
// this label the first time each version is used, so "trace a quality
// regression to a specific prompt revision" (ADR-007) means reading the
// real text, not just a version string (see
// docs/specs/cedar-prompt-registry.md).
export const CEDAR_BRAIN_PROMPT_VERSION = "v4";

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

// Live mode makes exactly ONE Anthropic call per request (not one per
// routed agent) — Section 33's budget/cost-governance mechanism doesn't
// exist yet (see ADR-007's "what this ADR will need to decide"), so
// multiplying real API spend per request with no cost safety net would
// introduce financial risk the Bible itself says needs governance first.
// Instead the single call is asked to structure its own response into
// per-agent sections, which parsePerAgentSections then splits into a
// real plan[] entry per agent — genuine per-agent output, zero
// additional API cost. See docs/specs/cedar-brain-per-agent-output.md.
export function parsePerAgentSections(text: string, agents: CedarAgent[]): { agent: CedarAgent; output: string }[] | null {
  const headerPattern = /^###\s*(\S+)\s*$/gm;
  const headers = [...text.matchAll(headerPattern)];
  if (headers.length === 0) return null;

  const results: { agent: CedarAgent; output: string }[] = [];
  for (let i = 0; i < headers.length; i++) {
    const match = headers[i];
    const agentName = match[1];
    const sectionStart = match.index! + match[0].length;
    const sectionEnd = i + 1 < headers.length ? headers[i + 1].index! : text.length;
    const output = text.slice(sectionStart, sectionEnd).trim();
    if ((agents as string[]).includes(agentName) && output) {
      results.push({ agent: agentName as CedarAgent, output });
    }
  }

  // Only trust the structured parse if every routed agent got a real
  // section — a partial parse would silently drop real model output
  // rather than falling back to showing it as the raw summary.
  const foundAgents = new Set(results.map((r) => r.agent));
  if (!agents.every((a) => foundAgents.has(a))) return null;
  return results;
}

// The static instructional portion of the system prompt — everything
// that does NOT vary per request (the routed agent list, the governed
// context, and the per-agent section headers are interpolated in
// buildSystemPrompt below). This is the actual text a prompt-version
// registry snapshot records (see docs/specs/cedar-prompt-registry.md):
// CEDAR_BRAIN_PROMPT_VERSION is only a label; this constant is what
// that label actually refers to, captured verbatim so "trace a
// quality regression to a specific prompt revision" (ADR-007) means
// reading the real text that was used, not just a version string.
export const SYSTEM_PROMPT_TEMPLATE = `You are Cedar Brain, the orchestration layer of Cedar Point OS, an AI-native
operating system for a marketing agency. A request has already been routed to
the specialist agents listed below.

Respond with exactly one section per agent, in this format — a line starting
with "### " followed by the agent's exact name from the list below, then that
agent's concrete, specific contribution to the request (2-5 sentences, no
generic filler, nothing outside these sections).

If real governed-context data was retrieved for this request (Section 6.1),
use it, don't contradict it, and don't invent facts beyond it.`;

function buildSystemPrompt(agents: CedarAgent[], governedContext?: string): string {
  const sectionTemplate = agents.map((a) => `### ${a}\n<${a}'s concrete contribution, 2-5 sentences>`).join("\n\n");
  return `${SYSTEM_PROMPT_TEMPLATE}

Agents routed for this request: ${agents.join(", ")}

${sectionTemplate}${
    governedContext ? `\n\nReal data retrieved for this request:\n${governedContext}` : ""
  }`;
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

  const systemPrompt = buildSystemPrompt(agents, governedContext);

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
  const parsedPlan = parsePerAgentSections(text, agents);

  return {
    mode: "live" as const,
    summary: text,
    plan: parsedPlan ?? agents.map((agent) => ({ agent, output: null })),
    usage: data.usage
      ? { inputTokens: data.usage.input_tokens as number, outputTokens: data.usage.output_tokens as number }
      : null,
  };
}
