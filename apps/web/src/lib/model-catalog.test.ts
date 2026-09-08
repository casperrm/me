// Unit tests for the model routing policy (Section 33 — see
// docs/specs/model-catalog.md). Pure, deterministic function — no
// Postgres, no ANTHROPIC_API_KEY needed.
import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, selectModelForRequest } from "./model-catalog";
import { routeToAgents } from "./cedar-brain";

describe("MODEL_CATALOG", () => {
  it("has exactly one entry per tier", () => {
    const tiers = MODEL_CATALOG.map((entry) => entry.tier);
    expect(tiers.sort()).toEqual(["fast", "premium", "standard"]);
  });
});

describe("selectModelForRequest — tier boundaries", () => {
  it("selects the fast tier (Haiku) for exactly 2 agents (the routeToAgents floor)", () => {
    const model = selectModelForRequest(["marketing", "quality_control"]);
    expect(model.tier).toBe("fast");
    expect(model.id).toBe("claude-haiku-4-5-20251001");
  });

  it("selects the fast tier for a single agent (below the real-world floor, still handled)", () => {
    const model = selectModelForRequest(["marketing"]);
    expect(model.tier).toBe("fast");
  });

  it("selects the standard tier (Sonnet) for exactly 3 agents", () => {
    const model = selectModelForRequest(["marketing", "design", "quality_control"]);
    expect(model.tier).toBe("standard");
    expect(model.id).toBe("claude-sonnet-5");
  });

  it("selects the premium tier (Opus) for exactly 4 agents", () => {
    const model = selectModelForRequest(["marketing", "design", "video", "quality_control"]);
    expect(model.tier).toBe("premium");
    expect(model.id).toBe("claude-opus-5");
  });

  it("selects the premium tier for more than 4 agents too", () => {
    const model = selectModelForRequest([
      "marketing",
      "design",
      "video",
      "localization",
      "campaign",
      "quality_control",
    ]);
    expect(model.tier).toBe("premium");
  });
});

describe("selectModelForRequest — fed real routeToAgents() output end to end", () => {
  it("routes a generic prompt (marketing fallback + QC = 2 agents) to the fast tier", () => {
    const agents = routeToAgents("Hello there, how are you?");
    expect(agents).toHaveLength(2);
    expect(selectModelForRequest(agents).tier).toBe("fast");
  });

  it("routes a genuinely multi-domain prompt (design + video + campaign + QC = 4 agents) to the premium tier", () => {
    const agents = routeToAgents(
      "We need a video storyboard, a matching banner design, and a Meta ads campaign with a budget and KPIs.",
    );
    expect(agents.length).toBeGreaterThanOrEqual(4);
    expect(selectModelForRequest(agents).tier).toBe("premium");
  });
});
