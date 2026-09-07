# Module: API Route-Contract Tests

Status: **Implemented (representative slice, extended three times)**.
Closes
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

## Extension slice 2: MFA, invite-accept, search

A third slice covers the remaining distinct contract shapes still
missing: two more routes with no session to mock (one because it's
mid-enrollment for an already-signed-in user calling itself, two
because there's no session at all yet), and the one route whose
correctness depends on *filtering* results by what the caller can see
rather than a flat allow/deny.

- **`POST /api/auth/mfa/setup`, `/confirm`, `/disable`** — session-gated
  (unlike challenge/login), but the interesting case is calling the
  real `mfa-service.ts` functions with real `otplib`-generated TOTP
  codes against a real encrypted secret round-tripped through Postgres,
  not a stubbed "valid code" check: `setup` returns a real `otpauth://`
  URI and a real QR code data URL and rejects re-enrollment once
  already enabled; `confirm` rejects a wrong code with the service's
  real message and, for a real valid code, persists both `mfaEnabled`
  and a set of real hashed recovery codes matching the response's
  count; `disable` requires re-proving the account password (rejecting
  the wrong one without disabling anything) and, on success, actually
  clears both `mfaEnabled` and every recovery code.
- **`POST /api/auth/mfa/challenge`** — the one MFA route with no
  session at all (it's the second half of *creating* one): gated by a
  `pendingToken` from a real `login()` call instead of
  `getCurrentActor`, confirms a wrong code is rejected without
  consuming the pending login, and that a real valid TOTP code succeeds
  once and then correctly fails on reuse (the row is deleted, not just
  marked used).
- **`POST /api/invite/[token]/accept`** — the other no-session route:
  400 for a missing name/password, 400 with the real "invalid or has
  expired" message for an unknown token, 200 that actually creates the
  `User` row and an `ACTIVE` membership with the invited role (created
  via a real `createInvitation()` call, not a hand-inserted token), and
  confirms the same token can't be used a second time. Needs the same
  `next/headers` mock as the login route, since accepting an invite
  signs the new user in immediately.
- **`GET /api/search`** — the route's whole point is filtering, so the
  meaningful test isn't 401/200, it's proving `getReadableClientIds`
  is actually wired through: an org-wide reader sees both of two
  same-named-pattern clients, while a `DESIGNER` scoped via
  `ScopedGrant` to only one of them sees just that one in the same
  query — the un-scoped client is confirmed absent from their results,
  not merely present in the org-wide reader's.

## Extension slice 3: CRUD writes, file storage, connections

The fourth slice covers the largest remaining single category:
straightforward `clients:write`-gated create routes (campaign,
creative, creative version, video brief, project, task, shoot, content
item, brand version), plus the two contract shapes that hadn't been
touched yet — a route that writes to real file storage, not just
Postgres, and the `organization:manage`-gated pair (distinct from
`clients:write` everywhere else in this app).

- **Campaign/creative/task/project/shoot/content/brand create routes**
  (9 routes) — all share one shape: 401 unauthenticated, 400 missing
  required field, 403 for a `DESIGNER` without `clients:write`, 200
  with a real persisted row, and a cross-tenant case. That cross-tenant
  case surfaced a real pattern worth documenting: every one of these
  services calls `requirePermission` *before* verifying the given
  parent (client/project/campaign/creative) actually belongs to the
  caller's organization — an `OWNER`'s role check short-circuits to
  "can do anything" without touching the database, so it's the
  *second* check (`assertClientInOrg`/`assertProjectInOrg`/
  `assertCampaignInOrg`/`assertCreativeInOrg`) that actually catches a
  cross-org id, and it throws `AuthError` → **400**, not
  `AuthorizationError` → 403. Getting this wrong in a test (assuming
  403) fails immediately against the real route, which is exactly what
  this layer of test exists to catch.
- **`POST /api/clients/[id]/assets`, `DELETE /api/assets/[id]`,
  `GET /api/assets/[id]/download`** — the one contract shape where
  correctness isn't just a database row: `uploadAsset`/`deleteAsset`
  write to and delete from the real local filesystem storage adapter
  (`lib/storage/local-adapter.ts`), not a mock. These three tests reuse
  the `process.cwd()` monkeypatch + dynamic-`import("./route")` trick
  `asset-service.integration.test.ts` established (the adapter computes
  its root from `process.cwd()` at module-load time, so cwd has to be
  patched *before* the route module — and everything it transitively
  imports — is first loaded) to redirect all three routes at a
  throwaway temp directory, so this test suite never touches the real
  app's `.storage/`. The upload test confirms the uploaded bytes are
  actually readable back off disk through the same adapter the
  download route uses; the delete test confirms the file is actually
  gone from disk, not just the database row; the download test drives
  `verifyAssetToken`/`buildSignedDownloadPath` for real (missing token,
  tampered token, a valid token signed for a *different* asset id,
  a valid token that works, and a valid token for a since-deleted
  asset) since this route is deliberately the one asset route with no
  session check at all — its whole contract is the signed token.
- **`POST /api/integrations/connections`,
  `POST /api/integrations/connections/[id]/revoke`** — the one pair
  gated on `organization:manage` rather than `clients:write` (every
  other write route in this app is `clients:write`-gated), confirming
  a `DESIGNER` who'd pass a `clients:write` check elsewhere is still
  correctly rejected here. The create test confirms a real signing
  secret and a real `Connection` row (`status: "CONNECTED"`, matching
  the schema default — not "ACTIVE"); the revoke test confirms the row
  actually flips to `"DISCONNECTED"` and rejects a connection from a
  different organization.

## Scope boundary — stated explicitly

**Still not exhaustive.** There are 40 API route handlers in this app;
36 now have contract tests (proving the pattern across session-gated
writes, non-session HMAC-gated writes, membership-owned-not-role-gated
writes, state-machine transitions, the login route that creates the
session itself, an in-session-but-self-referential MFA enrollment
flow, a filtering-not-gating read route, real file-storage writes, and
the one `organization:manage`-gated pair). Four remain genuinely
uncovered — `/api/auth/bootstrap`, `/api/cedar-brain/[id]/flag`,
`/api/invoices/[id]/mark-paid`, `/api/invoices/[id]/send` — real,
valuable, follow-up work, not claimed as done here. Idempotency is
proven for the one route that actually has an idempotency mechanism
(`/api/integrations/webhooks/[id]`); routes with no such mechanism
aren't tested for it, since there's nothing there to test.

## Acceptance tests

- `apps/web/src/app/api/expenses/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/invoices/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/integrations/webhooks/[id]/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/cedar-brain/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/team/invite/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/creative-versions/[versionId]/approval.route.contract.test.ts` — 7 tests.
- `apps/web/src/app/api/clients/[id]/assets/search/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/auth/login/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/notifications/[id]/read/route.contract.test.ts` — 3 tests.
- `apps/web/src/app/api/notifications/[id]/acknowledge/route.contract.test.ts` — 3 tests.
- `apps/web/src/app/api/notifications/mark-all-read/route.contract.test.ts` — 2 tests.
- `apps/web/src/app/api/content/[itemId]/status/route.contract.test.ts` — 6 tests.
- `apps/web/src/app/api/shoots/[shootId]/status/route.contract.test.ts` — 6 tests.
- `apps/web/src/app/api/auth/mfa/setup/route.contract.test.ts` — 3 tests.
- `apps/web/src/app/api/auth/mfa/confirm/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/auth/mfa/challenge/route.contract.test.ts` — 3 tests.
- `apps/web/src/app/api/auth/mfa/disable/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/invite/[token]/accept/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/search/route.contract.test.ts` — 3 tests.
- `apps/web/src/app/api/campaigns/[campaignId]/creatives/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/creatives/[creativeId]/versions/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/creatives/[creativeId]/video-brief/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/projects/[projectId]/campaigns/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/projects/[projectId]/tasks/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/clients/[id]/projects/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/clients/[id]/shoots/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/clients/[id]/content/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/clients/[id]/brand/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/clients/[id]/assets/route.contract.test.ts` — 6 tests.
- `apps/web/src/app/api/assets/[id]/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/assets/[id]/download/route.contract.test.ts` — 5 tests.
- `apps/web/src/app/api/integrations/connections/route.contract.test.ts` — 4 tests.
- `apps/web/src/app/api/integrations/connections/[id]/revoke/route.contract.test.ts` — 4 tests.
- Manual smoke test performed for the first slice against the real
  running server: confirmed `amountCents: 0` on both `/api/expenses`
  and `/api/invoices` now correctly returns "Amount must be a positive
  number" instead of the misleading "required" message — no dev
  database mutation occurred (both requests were correctly rejected).
- Manual smoke test performed for the second slice against a real
  running production server (`npm run start`): logged in as the seeded
  owner through the real `/api/auth/login` route (not mocked), loaded
  `/dashboard` with the resulting session cookie, and called
  `/api/notifications/mark-all-read` for real — confirmed it returned
  200 and, via a direct SQL check, that the dev database has no
  notification rows at all (so this was a genuine no-op against real
  data, not a state change requiring cleanup).
- Manual smoke test performed for the third slice against a real
  running production server: confirmed `/api/search?q=volt` returns
  the real seeded client via the logged-in owner's session, confirmed
  `/api/auth/mfa/setup` correctly 401s when unauthenticated (deliberately
  not exercised further against the real seeded owner account, since
  actually enabling MFA on it would break every future session's
  login smoke test), and drove a complete real invite→accept round
  trip through the live `/api/team/invite` and `/api/invite/[token]/accept`
  routes — created a throwaway invitee, confirmed via direct SQL that
  a real `User` and `ACTIVE` `DESIGNER` membership were persisted, then
  deleted all of it (session, audit event, membership, invitation,
  user) and confirmed the dev database's user/membership counts were
  back at their pre-test values.
- Manual smoke test performed for the fourth slice against a real
  running production server: logged in as the seeded owner and drove a
  full real chain through the live API — created a project on the
  seeded client, a campaign on that project, a creative on that
  campaign, and a second version on that creative; uploaded a real
  file through `/api/clients/[id]/assets` (confirmed the bytes exist
  on disk at the real `storageKey` afterward); created a real
  connection through `/api/integrations/connections` and revoked it.
  Cross-checked every row directly via `psql`, then deleted the file
  from disk and every row from Postgres (including cascaded
  `creative_versions`/`connection_events`/`audit_events`/
  `client_timeline_events`) and confirmed the dev database's
  project/campaign/creative/asset/connection counts were back at their
  pre-test (seeded) values.
