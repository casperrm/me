// Redis-backed abuse-control rate limiting (Bible Section 23.1: "Rate
// limiting and abuse controls on authentication, public/client portal
// endpoints, AI endpoints, and webhooks"). This closes the prediction
// docs/adr/0004-queue-and-outbox-strategy.md made when Redis was first
// introduced ("Redis will likely be needed anyway (caching, rate
// limiting)") — REDIS_URL was already required config
// (packages/config), just never consumed outside apps/worker's BullMQ
// until now.
//
// See docs/specs/rate-limiting.md for exactly which endpoints use this
// and which Section 23.1 categories (AI endpoints, client-portal
// endpoints) are deliberately not covered yet.
import IORedis from "ioredis";
import { loadEnv } from "@cedar/config";

let redisClient: IORedis | undefined;

function getRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = new IORedis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redisClient;
}

const KEY_PREFIX = "ratelimit:";

// Atomic increment-and-expire: a plain INCR followed by a separate EXPIRE
// call would leave a key with no TTL forever if the process died in
// between, permanently locking out that bucket.
const INCR_AND_EXPIRE_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if tonumber(current) == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limit: allows up to `limit` calls per `windowSeconds`
 * for a given `bucketKey`. A fixed window (vs. a sliding-window log) is
 * simpler and sufficient for this threat model — throttling brute-force
 * login attempts and runaway webhook senders doesn't need per-request
 * precision at the window boundary.
 */
export async function checkRateLimit(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${bucketKey}`;
  const count = (await redis.eval(INCR_AND_EXPIRE_SCRIPT, 1, key, windowSeconds)) as number;
  const ttl = await redis.ttl(key);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

/** Test-only: reset a bucket so test runs don't interfere with each other on shared Redis. */
export async function resetRateLimitForTests(bucketKey: string): Promise<void> {
  await getRedisClient().del(`${KEY_PREFIX}${bucketKey}`);
}

/** Test-only: release the underlying Redis connection so vitest can exit cleanly. */
export async function closeRateLimitConnectionForTests(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = undefined;
  }
}
