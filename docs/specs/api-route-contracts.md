# Module: API Route-Contract Tests

Status: **Implemented (representative slice, extended once)**. Closes
the gap `ROADMAP.md`'s cross-cutting section had tracked: "API-contract
tests for the route handlers themselves (auth headers, error
envelopes, idempotency)."

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

## Routes covered — and why these six

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
- **`/api/team/invite`** — the identity-lifecycle write that starts
  every `invite-and-accept` E2E flow: 401/400/403 cases plus a real
  `CLIENT_PORTAL`-with-no-client validation case (400, from the
  service's own rule) and a real persisted `Invitation` row.
- **`/api/creative-versions/[versionId]/request-approval` and
  `.../decide`** — the two halves of Section 15.1's approval workflow
  the `approval-workflow` E2E test drives through the UI; this is the
  same lifecycle proven directly at the HTTP layer, including an
  invalid-decision-value case rejected by the real service (not just a
  route-level guess at valid values) and confirming the creative's
  `status` column actually transitions (`PENDING_APPROVAL`, then
  `APPROVED`) in the database, not just that the response was `200`.

## Extension slice: 6 more routes

A later slice, prompted by this doc's own "not exhaustive" note, added
contract tests for six more routes covering shapes the first batch
didn't: an unauthenticated entry point that itself creates the
session cookie, and three real 403-cases from `clients:write`/nothing
gates on notification ownership rather than a role.

- **`POST /api/auth/login`** — the one route with no `getCurrentActor`
  to mock at all, since it's what creates a session in the first
  place. Mocks `next/headers` directly (the same in-memory cookie
  store `identity.integration.test.ts` uses) instead: 400 for missing
  fields, 401 for wrong credentials (and confirms no cookie gets set),
  401 for a nonexistent email (without a different error message that
  would leak account existence), and 200 with a real session cookie
  and a real persisted `Session` row on success.
- **`POST /api/notifications/[id]/read`,
  `/api/notifications/[id]/acknowledge`,
  `/api/notifications/mark-all-read`** — the ownership model here is
  per-`membershipId`, not a role permission, so the 400 case that
  matters is a different membership's own notification (proving
  `assertOwnedByMembership` is actually wired through the route, not
  just unit-tested in isolation), and `mark-all-read`'s test creates
  notifications for two different memberships in the same organization
  to prove it updates only the caller's own, not every notification in
  the org.
- **`POST /api/content/[itemId]/status`,
  `POST /api/shoots/[shootId]/status`** — same shape as the earlier
  batch's finance routes (401/400/403), plus the state-machine-specific
  case each service actually enforces: an invalid `BRIEF → SCHEDULED`
  transition surfaces the real "Cannot move from..." message for
  content items, an unrecognized status string surfaces "Invalid shoot
  status" for shoots, and a cross-organization item/shoot id is
  rejected exactly like every other module's cross-tenant check.

## Scope boundary — stated explicitly

**Still not exhaustive.** There are roughly 38 API routes in this app;
15 now have contract tests (proving the pattern across session-gated
writes, non-session HMAC-gated writes, membership-owned-not-role-gated
writes, state-machine transitions, and the login route that creates
the session itself). Extending coverage to the remaining ~23 routes
(asset up/download, campaign/creative/task/project CRUD, MFA
challenge/confirm/disable/setup, invite-accept, integrations/
connections, search) is real, valuable, follow-up work — not claimed
as done here. Idempotency is proven for the one route that actually
has an idempotency mechanism (`/api/integrations/webhooks/[id]`);
routes with no such mechanism aren't tested for it, since there's
nothing there to test.

## Acceptance tests

- `apps/web/src/app/api/expenses/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/invoices/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/integrations/webhooks/[id]/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/team/invite/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/creative-versions/[versionId]/approval.route.contract.test.ts` — 7 tests.
- `apps/web/src/app/api/auth/login/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/notifications/[id]/read/route.contract.test.ts` — 3 tests.
- `apps/web/src/app/api/notifications/[id]/acknowledge/route.contract.test.ts` — 3 tests.
- `apps/web/src/app/api/notifications/mark-all-read/route.contract.test.ts` — 2 tests.
- `apps/web/src/app/api/content/[itemId]/status/route.contract.test.ts` — 6 tests.
- `apps/web/src/app/api/shoots/[shootId]/status/route.contract.test.ts` — 6 tests.
- Manual smoke test performed for the first slice against the real
  running server: confirmed `amountCents: 0` on both `/api/expenses`
  and `/api/invoices` now correctly returns "Amount must be a positive
  number" instead of the misleading "required" message — no dev
  database mutation occurred (both requests were correctly rejected).
- Manual smoke test performed for the extension slice against a real
  running production server (`npm run start`): logged in as the seeded
  owner through the real `/api/auth/login` route (not mocked), loaded
  `/dashboard` with the resulting session cookie, and called
  `/api/notifications/mark-all-read` for real — confirmed it returned
  200 and, via a direct SQL check, that the dev database has no
  notification rows at all (so this was a genuine no-op against real
  data, not a state change requiring cleanup).
