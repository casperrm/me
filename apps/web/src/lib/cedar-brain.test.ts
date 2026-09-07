// Unit tests for routeToAgents' word-boundary keyword matching. No
// Postgres needed — this is a pure function. See
// docs/specs/ai-eval-harness.md for the real bug this fix closed
// (found by building the AI Evaluation Harness): plain .includes()
// substring matching meant "script" matched inside "description" and
// "ad" matched inside "already"/"administrator".
import { describe, expect, it } from "vitest";
import { routeToAgents } from "./cedar-brain";

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
