# Rate limiting and abuse controls

Bible Section 23.1: "Rate limiting and abuse controls on authentication,
public/client portal endpoints, AI endpoints, and webhooks."

## What's built

A Redis-backed fixed-window rate limiter, `checkRateLimit(bucketKey, limit,
windowSeconds)` in `packages/auth/src/rate-limit.ts`, applied to exactly two
endpoints:

- **`POST /api/auth/login`** — 10 attempts per 15 minutes, keyed by
  `login:<ip>` (`X-Forwarded-For`, falling back to `"unknown"` when absent).
  Brute-force/credential-stuffing protection on the one endpoint that turns
  a guessed password into a real session. The check runs before request
  body parsing, so a malformed-body flood is throttled too.
- **`POST /api/integrations/webhooks/[id]`** — 120 requests per minute,
  keyed by `webhook:<connectionId>`. This is the one route in the entire
  app with no session auth at all (external systems authenticate purely
  via the `X-Cedar-Signature` HMAC header — see
  `docs/specs/integration-center.md`), which makes it the clearest match
  for Section 23.1's "webhooks" category. The threshold is generous —
  Zapier/Make-style senders can legitimately burst — this is a ceiling
  against a runaway or malicious sender, not a functional throttle.

Both return `429` with `{ error: string }` and a `Retry-After` header (the
bucket's remaining TTL in seconds) once exceeded.

### Implementation

- **Algorithm:** fixed window, not a sliding-window log. An atomic Lua
  script (`INCR` + `EXPIRE` on first increment) avoids the race where a
  plain `INCR` then a separate `EXPIRE` call could leave a key with no TTL
  if the process died in between — for abuse-control code, a bucket that
  can never expire is a real risk, not a theoretical one. A fixed window
  is simpler than a sliding-window log and sufficient for this threat
  model: throttling brute-force logins and runaway webhook senders doesn't
  need per-request precision at the window boundary.
- **Redis connection:** `packages/auth` owns a lazily-created `ioredis`
  singleton pointed at `REDIS_URL` (already required, `zod`-validated
  config — see `packages/config/src/index.ts`). This is `apps/web`'s first
  direct Redis connection; previously only `apps/worker`'s BullMQ queues
  used Redis. See the dated log entry in
  `docs/adr/0004-queue-and-outbox-strategy.md`, which named "rate
  limiting" as a predicted future Redis use case when Redis/BullMQ was
  first chosen over a Postgres-backed queue.

## What's deliberately not built here

Section 23.1 names four categories; this slice covers two. The other two
are real, scoped-out gaps, not oversights:

- **AI endpoints** (`/api/cedar-brain`, `/api/eval/run`) — Cedar Brain
  already has a separate, more targeted abuse control: per-organization
  AI budget governance (`docs/specs/ai-budget-governance.md`), which caps
  spend rather than request count. A request-rate limit on top of that
  would be a second, redundant throttle without a concrete abuse scenario
  driving it yet.
- **Client-portal endpoints** (`/portal/**`, `/api/portal/**`) — these are
  session-authenticated like the rest of the app (Section 15.2), so they
  don't share the login/webhook endpoints' "no prior authentication"
  property that makes rate limiting the primary defense. A future slice
  could add a per-account-or-IP limit here if portal abuse becomes a real,
  observed problem; today it would be speculative.
- **Distributed/multi-instance correctness beyond what Redis already
  gives:** the counter is already safe across multiple `apps/web`
  instances (it lives in the shared Redis, not in-process memory) — that
  part isn't a gap. What's not built is anything smarter than a flat
  per-bucket cap: no exponential backoff, no CAPTCHA challenge, no
  IP-reputation/deny-list. Section 23.1 says "rate limiting and abuse
  controls"; this is the rate-limiting half.
- **A production-grade `X-Forwarded-For` trust boundary:** in a real
  deployment behind a load balancer or reverse proxy, only the
  proxy-appended value should be trusted (a client can otherwise spoof
  this header to evade the per-IP bucket entirely). Which hop to trust
  depends on the eventual hosting platform — still blocked on ADR-010
  (deployment platform), same as every other production-hardening item
  that depends on real infrastructure. Today's `X-Forwarded-For`-first,
  `"unknown"`-fallback approach is honest about being a development-time
  approximation, not a production-hardened one.

## Testing

- `packages/auth/src/rate-limit.integration.test.ts` — against real Redis:
  allows-then-blocks at the limit, `retryAfterSeconds` is sane, a window
  expires and resets, independent buckets don't interfere.
- `apps/web/src/app/api/auth/login/route.contract.test.ts` — a dedicated
  test floods one fake IP past the 10-attempt limit and asserts `429` +
  `Retry-After`; the four pre-existing test cases each use their own fake
  IP so they don't interfere with the limiter or each other.
- `apps/web/src/app/api/integrations/webhooks/[id]/route.contract.test.ts`
  — a dedicated test floods the test connection past the 120/minute limit
  and asserts `429` + `Retry-After`.
- Live-verified against a real running `apps/web` production build and
  real Redis: 11 real HTTP `POST`s to `/api/auth/login` from a fake IP
  (10 allowed, 11th `429` with a real `Retry-After` value); a real
  connection created via the authenticated API, then 121 real signed
  `POST`s to its webhook URL (120 allowed, 121st `429`). All rate-limit
  keys, the smoke-test connection, and its audit/connection-event rows
  were deleted afterward.
