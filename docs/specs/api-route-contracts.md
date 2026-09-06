# Module: API Route-Contract Tests

Status: **Implemented (representative slice)**. Closes the gap
`ROADMAP.md`'s cross-cutting section had tracked: "API-contract tests
for the route handlers themselves (auth headers, error envelopes,
idempotency)."

## Purpose

Every service function in this codebase has real integration-test
coverage against Postgres (`*.integration.test.ts`), but nothing tested
the Next.js route handlers (`route.ts` files) themselves — the layer
that parses the request, decides HTTP status codes, and shapes the
JSON envelope. A route handler can have a bug (wrong status code,
swallowed error, a pre-check that shadows the real service's
validation) even when the service underneath is perfectly correct and
fully tested. This slice adds that missing layer, for a representative
set of routes, and it found two real bugs immediately.

## The pattern (`*.route.contract.test.ts`, colocated with each route)

- `vitest.config.ts` gained a `resolve.alias` for `"@"` → `apps/web/src`
  (mirroring `tsconfig.json`'s path) so these tests can import
  `route.ts` files using the app's normal `@/...` import style — this
  didn't work before and is the one config change needed to make this
  layer testable at all.
- `@/lib/current-actor`'s `getCurrentActor` is mocked per test (via
  `vi.hoisted`) to control exactly who's "signed in" — `null` for
  unauthenticated, or a real actor object pointing at rows created in a
  real Postgres `beforeAll` (same wipe-and-seed pattern as every
  integration test). **Nothing else is mocked** — the real service
  functions underneath still run against real Postgres, so these tests
  verify the HTTP contract without becoming shallow, everything-mocked
  tests that would just restate the route's own code.
- A request is a real `Request` object (Next.js route handlers are
  plain functions over the Fetch API `Request`/`Response`) — no test
  server, no HTTP client, no port.

## Real bugs this slice found and fixed

Both `/api/expenses` and `/api/invoices` had the same bug: their
pre-service validation checked `!body?.amountCents`, which is **truthy
for `0`** — passing `amountCents: 0` was misreported as "amount is
required" instead of reaching `createExpense`/`createInvoice`'s own
correct "must be a positive number" message. Fixed by checking
`typeof body?.amountCents !== "number"` instead, so presence and type
are validated at the route layer and the *value* is validated once, by
the service that owns that rule. Confirmed against a real running
server: `amountCents: 0` on both routes now correctly returns "Amount
must be a positive number."

## Routes covered — and why these four

- **`/api/expenses`** — the simplest representative case: session
  auth → 401, route-level input validation → 400, `AuthorizationError`
  → 403 (implicitly, via the shared pattern proven on `/api/invoices`),
  real success envelope with a real persisted row.
- **`/api/invoices`** — adds the `AuthorizationError` → 403 case
  explicitly (a `DESIGNER` role member lacking `finance:write`), and is
  where the `amountCents: 0` bug was first caught.
- **`POST /api/integrations/webhooks/[id]`** — the one route in this
  app that is deliberately **not** session-authenticated. Its contract
  is entirely different (HMAC signature, not `getCurrentActor`), so
  it's tested on its own terms: missing signature → 401, wrong
  signature → 401, a correctly signed event → 200 with
  `deduped: false`, an exact replay → 200 with `deduped: true` (the
  real DB-level idempotency dedupe, not just a mocked assertion), and
  an unknown connection id → 400.
- **`/api/cedar-brain`** — the most structurally complex route: auth →
  401, missing prompt → 400, a real stub-mode success envelope with
  real `CedarBrainRequest` telemetry persisted (`promptVersion: "v2"`,
  `latencyMs` measured), a client-scoped request denied with 403 for an
  unreadable client, and a client-scoped request returning the real
  governed-context `sources` list for a readable one — proving the
  AI Supervisor and governed-context-retrieval wiring both work at the
  actual HTTP layer, not just inside their own service-level tests.

## Scope boundary — stated explicitly

**Not exhaustive.** There are roughly 35 API routes in this app; four
were chosen to establish and prove the reusable pattern across the
distinct contract shapes that actually exist (session-gated write,
non-session HMAC-gated write, a route with real cross-cutting
side-effects like AI telemetry and context retrieval). Extending
coverage to the remaining routes is real, valuable, follow-up work —
not claimed as done here. Idempotency is proven for the one route that
actually has an idempotency mechanism (`/api/integrations/webhooks/[id]`);
routes with no such mechanism aren't tested for it, since there's
nothing there to test.

## Acceptance tests

- `apps/web/src/app/api/expenses/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/invoices/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/integrations/webhooks/[id]/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` — 5 tests.
- Manual smoke test performed for this slice against the real running
  server: confirmed `amountCents: 0` on both `/api/expenses` and
  `/api/invoices` now correctly returns "Amount must be a positive
  number" instead of the misleading "required" message — no dev
  database mutation occurred (both requests were correctly rejected).
