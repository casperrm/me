// Unit tests for routeToAgents' word-boundary keyword matching. No
// Postgres needed — this is a pure function. See
// docs/specs/ai-eval-harness.md for the real bug this fix closed
// (found by building the AI Evaluation Harness): plain .includes()
// substring matching meant "script" matched inside "description" and
// "ad" matched inside "already"/"administrator".
import { describe, expect, it } from "vitest";
import { callCedarBrain, parsePerAgentSections, routeToAgents } from "./cedar-brain";

describe("routeToAgents — word-boundary matching (regression for the substring bug)", () => {
  it("does not match 'script' inside 'description'", () => {
    const agents = routeToAgents("Can you write a product description for this?");
    expect(agents).not.toContain("video");
  });

  it("does not match 'ad' inside 'already'", () => {
    // A prompt with an unrelated real signal (video) so the "no agent
    // matched" fallback can't mask whether "ad" false-matched too.
    const agents = routeToAgents("The video script is already finished.");
    expect(agents).toEqual(expect.arrayContaining(["video", "quality_control"]));
    expect(agents).not.toContain("marketing");
  });

  it("does not match 'ad' inside 'administrator'", () => {
    const agents = routeToAgents("Ask the administrator to review this video script.");
    expect(agents).toEqual(expect.arrayContaining(["video", "quality_control"]));
    expect(agents).not.toContain("marketing");
  });

  it("still matches 'ad' as a standalone word", () => {
    const agents = routeToAgents("Can you write a new ad for this product?");
    expect(agents).toContain("marketing");
  });

  it("still matches 'script' as a standalone word", () => {
    const agents = routeToAgents("Can you write a video script for this?");
    expect(agents).toContain("video");
  });

  it("still matches 'localiz' as a prefix (localize/localization/localizing)", () => {
    expect(routeToAgents("Please localize this ad copy.")).toContain("localization");
    expect(routeToAgents("We need localization for this market.")).toContain("localization");
    expect(routeToAgents("We're localizing this campaign now.")).toContain("localization");
  });

  it("falls back to marketing when nothing matches, and always appends quality_control", () => {
    const agents = routeToAgents("Hello there, how are you?");
    expect(agents).toContain("marketing");
    expect(agents).toContain("quality_control");
  });

  it("matches multiple agents for a genuinely multi-domain prompt", () => {
    const agents = routeToAgents("We need a storyboard for the video and a matching banner design.");
    expect(agents).toEqual(expect.arrayContaining(["video", "design", "quality_control"]));
  });
});

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
