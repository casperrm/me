// Clears every Redis rate-limit bucket before the E2E suite runs,
// alongside the existing db:reset — see resetAllRateLimitsForTests's own
// doc comment in packages/auth/src/rate-limit.ts for why this exists.
import { closeRateLimitConnectionForTests, resetAllRateLimitsForTests } from "@cedar/auth";

async function main() {
  await resetAllRateLimitsForTests();
  await closeRateLimitConnectionForTests();
}

main().catch((err) => {
  console.error("Failed to reset rate limits:", err);
  process.exit(1);
});
