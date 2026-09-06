import { describe, expect, it } from "vitest";
import {
  approvalLatencyPenalty,
  clampHealthScore,
  computeMarginPct,
  overdueInvoicePenalty,
  overdueProjectPenalty,
  overdueTaskPenalty,
  qcFailRatePenalty,
} from "./formulas";

describe("computeMarginPct", () => {
  it("returns null when revenue is 0", () => {
    expect(computeMarginPct(0, 0)).toBeNull();
    expect(computeMarginPct(-500, 0)).toBeNull();
  });

  it("computes a positive margin", () => {
    expect(computeMarginPct(2500, 10000)).toBe(25);
  });

  it("computes a negative margin when cost exceeds revenue", () => {
    expect(computeMarginPct(-1000, 10000)).toBe(-10);
  });
});

describe("overdueTaskPenalty", () => {
  it("scales linearly below the cap", () => {
    expect(overdueTaskPenalty(0)).toBe(0);
    expect(overdueTaskPenalty(2)).toBe(10);
  });

  it("caps at 25", () => {
    expect(overdueTaskPenalty(10)).toBe(25);
  });
});

describe("overdueProjectPenalty", () => {
  it("caps at 20", () => {
    expect(overdueProjectPenalty(5)).toBe(20);
    expect(overdueProjectPenalty(1)).toBe(10);
  });
});

describe("overdueInvoicePenalty", () => {
  it("caps at 30", () => {
    expect(overdueInvoicePenalty(5)).toBe(30);
    expect(overdueInvoicePenalty(1)).toBe(15);
  });
});

describe("approvalLatencyPenalty", () => {
  it("returns 0 under the warn threshold", () => {
    expect(approvalLatencyPenalty(10)).toBe(0);
  });

  it("returns the warn penalty between 24h and 72h", () => {
    expect(approvalLatencyPenalty(48)).toBe(5);
  });

  it("returns the critical penalty above 72h", () => {
    expect(approvalLatencyPenalty(100)).toBe(10);
  });
});

describe("qcFailRatePenalty", () => {
  it("rounds the scaled fail rate", () => {
    expect(qcFailRatePenalty(0)).toBe(0);
    expect(qcFailRatePenalty(0.5)).toBe(10);
    expect(qcFailRatePenalty(1)).toBe(20);
  });
});

describe("clampHealthScore", () => {
  it("clamps to [0, 100]", () => {
    expect(clampHealthScore(-10)).toBe(0);
    expect(clampHealthScore(150)).toBe(100);
    expect(clampHealthScore(55)).toBe(55);
  });
});
