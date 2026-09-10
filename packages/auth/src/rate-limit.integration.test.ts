// Integration test against a real Redis instance (REDIS_URL), not a mock —
// the atomic INCR+EXPIRE Lua script is exactly the part worth proving
// against the real thing.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, closeRateLimitConnectionForTests, resetAllRateLimitsForTests, resetRateLimitForTests } from "./rate-limit";

const usedKeys = new Set<string>();

function bucket(name: string): string {
  const key = `test:${name}:${Math.random().toString(36).slice(2)}`;
  usedKeys.add(key);
  return key;
}

afterEach(async () => {
  await Promise.all([...usedKeys].map((key) => resetRateLimitForTests(key)));
  usedKeys.clear();
});

afterAll(async () => {
  await closeRateLimitConnectionForTests();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks", async () => {
    const key = bucket("basic");
    for (let i = 1; i <= 3; i++) {
      const result = await checkRateLimit(key, 3, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - i);
    }
    const blocked = await checkRateLimit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("reports a positive retryAfterSeconds within the configured window", async () => {
    const key = bucket("retry-after");
    const result = await checkRateLimit(key, 1, 60);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets after the window expires", async () => {
    const key = bucket("expiry");
    const first = await checkRateLimit(key, 1, 1);
    expect(first.allowed).toBe(true);
    const secondImmediately = await checkRateLimit(key, 1, 1);
    expect(secondImmediately.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const afterExpiry = await checkRateLimit(key, 1, 1);
    expect(afterExpiry.allowed).toBe(true);
  });

  it("tracks independent buckets separately", async () => {
    const keyA = bucket("bucket-a");
    const keyB = bucket("bucket-b");
    for (let i = 0; i < 2; i++) await checkRateLimit(keyA, 2, 60);
    const stillOpenB = await checkRateLimit(keyB, 2, 60);
    expect(stillOpenB.allowed).toBe(true);
    const blockedA = await checkRateLimit(keyA, 2, 60);
    expect(blockedA.allowed).toBe(false);
  });
});

describe("resetAllRateLimitsForTests", () => {
  it("clears every bucket, real ones included, without touching unrelated keys", async () => {
    const keyA = bucket("wipe-a");
    const keyB = bucket("wipe-b");
    await checkRateLimit(keyA, 5, 60);
    await checkRateLimit(keyB, 5, 60);

    const beforeA = await checkRateLimit(keyA, 5, 60);
    expect(beforeA.remaining).toBe(3); // 2 prior calls + this one

    await resetAllRateLimitsForTests();

    const afterA = await checkRateLimit(keyA, 5, 60);
    const afterB = await checkRateLimit(keyB, 5, 60);
    expect(afterA.remaining).toBe(4); // back to a fresh window
    expect(afterB.remaining).toBe(4);
  });
});
