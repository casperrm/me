import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildSignedDownloadPath, verifyAssetToken } from "./signed-url";

describe("signed asset download tokens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a freshly issued token verifies for the same asset", () => {
    const path = buildSignedDownloadPath("asset-1", 300);
    const token = new URL(path, "http://localhost").searchParams.get("token")!;
    expect(verifyAssetToken("asset-1", token)).toBe(true);
  });

  it("the same token is rejected for a different asset id", () => {
    const path = buildSignedDownloadPath("asset-1", 300);
    const token = new URL(path, "http://localhost").searchParams.get("token")!;
    expect(verifyAssetToken("asset-2", token)).toBe(false);
  });

  it("expires after its window passes", () => {
    const path = buildSignedDownloadPath("asset-1", 60);
    const token = new URL(path, "http://localhost").searchParams.get("token")!;

    vi.advanceTimersByTime(59_000);
    expect(verifyAssetToken("asset-1", token)).toBe(true);

    vi.advanceTimersByTime(2_000); // now 61s later
    expect(verifyAssetToken("asset-1", token)).toBe(false);
  });

  it("rejects a malformed or tampered token", () => {
    expect(verifyAssetToken("asset-1", "not-a-real-token")).toBe(false);
    expect(verifyAssetToken("asset-1", "")).toBe(false);

    const path = buildSignedDownloadPath("asset-1", 300);
    const token = new URL(path, "http://localhost").searchParams.get("token")!;
    const [expiresAt] = token.split(".");
    expect(verifyAssetToken("asset-1", `${expiresAt}.deadbeef`)).toBe(false);
  });
});
