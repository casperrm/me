// Unit tests for what's still actually in cedar-brain.ts after the
// packages/ai extraction (see docs/adr/0007-ai-provider-gateway.md's
// dated log) — parsePerAgentSections and callCedarBrain's stub-mode
// model selection. routeToAgents' own word-boundary-matching tests moved
// to packages/ai/src/routing.test.ts alongside routeToAgents itself;
// routeToAgents is still imported here (re-exported from @cedar/ai via
// this file) so the model-selection tests below can drive it end to end.
import { describe, expect, it } from "vitest";
import { callCedarBrain, parsePerAgentSections, routeToAgents } from "./cedar-brain";

describe("parsePerAgentSections — real per-agent output breakdown (no extra API calls)", () => {
  it("splits a well-formed response into one entry per agent", () => {
    const text = "### marketing\nUse a bold hook.\n\n### quality_control\nCheck brand voice compliance.";
    const result = parsePerAgentSections(text, ["marketing", "quality_control"]);
    expect(result).toEqual([
      { agent: "marketing", output: "Use a bold hook." },
      { agent: "quality_control", output: "Check brand voice compliance." },
    ]);
  });

  it("returns null when the model didn't follow the section format at all", () => {
    const text = "Here's a plan: do the marketing thing and then the QC thing.";
    expect(parsePerAgentSections(text, ["marketing", "quality_control"])).toBeNull();
  });

  it("returns null when a routed agent is missing its section (partial parse is untrustworthy)", () => {
    const text = "### marketing\nUse a bold hook.";
    expect(parsePerAgentSections(text, ["marketing", "quality_control"])).toBeNull();
  });

  it("ignores a section for an agent that wasn't actually routed", () => {
    const text = "### marketing\nUse a bold hook.\n\n### video\nShould not appear — video wasn't routed.";
    const result = parsePerAgentSections(text, ["marketing"]);
    expect(result).toEqual([{ agent: "marketing", output: "Use a bold hook." }]);
  });

  it("handles sections in any order", () => {
    const text = "### quality_control\nLooks fine.\n\n### marketing\nUse a bold hook.";
    const result = parsePerAgentSections(text, ["marketing", "quality_control"]);
    expect(result).toEqual([
      { agent: "quality_control", output: "Looks fine." },
      { agent: "marketing", output: "Use a bold hook." },
    ]);
  });
});

describe("callCedarBrain — stub mode records the catalog-selected model (Section 33 routing policy)", () => {
  // No ANTHROPIC_API_KEY in the test environment, so these always run
  // the stub branch — see docs/specs/model-catalog.md for why
  // recording modelId even in stub mode is real, useful telemetry
  // rather than a no-op.
  it("records the fast-tier model id for a low-complexity prompt (2 routed agents)", async () => {
    const agents = routeToAgents("Hello there, how are you?");
    expect(agents).toHaveLength(2);
    const result = await callCedarBrain("Hello there, how are you?", agents);
    expect(result.mode).toBe("stub");
    expect(result.modelId).toBe("claude-haiku-4-5-20251001");
  });

  it("records the premium-tier model id for a high-complexity, multi-domain prompt", async () => {
    const prompt =
      "We need a video storyboard, a matching banner design, and a Meta ads campaign with a budget and KPIs.";
    const agents = routeToAgents(prompt);
    expect(agents.length).toBeGreaterThanOrEqual(4);
    const result = await callCedarBrain(prompt, agents);
    expect(result.mode).toBe("stub");
    expect(result.modelId).toBe("claude-opus-5");
  });
});
