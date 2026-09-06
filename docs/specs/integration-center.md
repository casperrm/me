# Module: Integration Center — Connector SDK + Generic Webhook

Status: **Implemented (Phase 4 starter slice)**. Bible reference:
Section 17.1 (Connector Framework), Section 34 (API/Connector
Implementation Contract).

## Purpose

`packages/connectors` was an empty placeholder and Phase 4 was entirely
"not started." This slice builds the real Section 34 adapter contract
and proves it end-to-end with one genuinely working connector — a
signed, provider-agnostic inbound webhook receiver — rather than a
mock, a stub, or an adapter that only compiles but was never actually
exercised.

## Why a generic webhook connector, not Meta/TikTok/Google/WhatsApp

Section 17.2 names those as priority integrations, but every one of
them requires a real OAuth app registration with that platform (a
developer account, an approved app, real client credentials) — this
environment cannot create those. Building an adapter class that calls
a real Meta/TikTok/Google endpoint with no real credentials to test it
against would be exactly the kind of unverified, "probably works"
code this project's discipline exists to avoid.

A **generic webhook receiver** needed no third-party account at all: an
organization generates its own signing secret here, configures it on
whatever external tool will call in (Zapier, Make, a custom script, or
another internal system), and the resulting connector is fully real
and fully testable — verified in this slice's own smoke test with an
actual `curl` request signed with `openssl`.

## The Section 34 contract (`packages/connectors/src/contract.ts`)

`ConnectorAdapter<TConnection>` — `authorize`, `refresh`, `healthCheck`,
`sync`, `handleWebhook`, `execute`, `reconcile`, `revoke` — matching
Section 34's method list. `ConnectionRecord`/`AuthorizeContext`/
`ConnectionHealth`/`SyncResult`/`VerifiedEvent`/`ExternalResult`/
`DriftReport` are the shared shapes every future adapter will use, so a
real Meta/TikTok/Google adapter can be added later against the same
interface without redesigning it.

## `GenericWebhookAdapter` — what each method actually does

- **`handleWebhook`**: verifies an HMAC-SHA256 signature (the
  `X-Cedar-Signature` header) against the connection's own secret using
  `timingSafeEqual`, rejects invalid JSON, and derives an idempotency
  key (the payload's own `id` field if present, otherwise a hash of the
  raw body) — this is the one method doing real, non-trivial work.
- **`healthCheck`**: real logic — `CONNECTED` with no events yet,
  `DEGRADED` after 7+ days without one, or the connection's own stored
  status.
- **`authorize`**: returns the shape a fresh connection starts in; the
  actual secret generation and DB write happen in
  `connection-service.ts` (an adapter shouldn't own persistence).
- **`revoke`**: reports whether the connection was already
  disconnected.
- **`refresh`, `sync`, `execute`, `reconcile`**: legitimately not
  applicable to *this* connector, documented per-method rather than
  silently stubbed — a webhook-only receiver has no OAuth token to
  refresh, nothing to pull on a cursor (it's push-only), no outbound
  command channel, and no external system of record to reconcile
  against. A future pull-based provider (e.g. Google Analytics) would
  implement these for real.

## Entities

| Model | Purpose |
|---|---|
| `Connection` | One configured connector per org. `provider` is `"generic_webhook"` today. `signingSecretEncrypted` uses the same `encryptSecret`/`decryptSecret` AES-256-GCM primitive as MFA (`packages/auth`) — reused rather than duplicated, per ADR-009's "at minimum, application-level encryption of credential columns" interim decision. |
| `ConnectionEvent` | One row per accepted webhook delivery, keyed `(connectionId, idempotencyKey)` — the real dedupe mechanism (Section 17.1: "deduplicate webhook events"). Payload is retained as bounded JSON for debugging/audit, per Section 34. |

## Permissions

`organization:manage` (ADMIN + implicit OWNER) — a connection's signing
secret is sensitive org infrastructure, comparable in blast radius to
inviting a member, not a per-client concern.

## The write path (`connection-service.ts`)

- **`createGenericWebhookConnection`**: generates a real 32-byte random
  signing secret, encrypts it at rest, and returns it to the caller
  **exactly once** — the same one-time-reveal discipline as an API key.
  There is no "show secret again" path; rotating means revoking and
  creating a new connection.
- **`listConnections`**: real per-connection health via the adapter.
- **`revokeConnection`**: sets `status = DISCONNECTED`; a revoked
  connection's webhook endpoint then rejects all further events.
- **`receiveWebhookEvent`**: decrypts the secret, delegates signature
  verification to the adapter, and persists the event — a duplicate
  `idempotencyKey` hits the DB's own unique constraint and is caught and
  reported as `deduped: true` rather than erroring or double-counting.

## UI

- **`/integrations`**: the Section 17.1 connection dashboard — status
  badge (`CONNECTED`/`DEGRADED`/`DISCONNECTED`/`ERROR`), event count,
  real health detail text, revoke action. A "+ Add generic webhook"
  form shows the webhook URL and signing secret exactly once at
  creation, with the HMAC-signing instructions the external tool needs.
- New nav item "Integration Center," shown only to `organization:manage`
  holders.
- **`POST /api/integrations/webhooks/[id]`**: the real public receiver.
  Deliberately **not** session-authenticated — the caller is an
  external tool with no Cedar Point OS session; authenticity comes
  entirely from the HMAC signature.

## Failure modes

- **Missing or wrong `X-Cedar-Signature`**: `401`.
- **Valid signature, invalid JSON body**: `401` (can't process an event
  it can't parse, even if it can trust who sent it).
- **A replayed event (same idempotency key)**: `200` with
  `deduped: true` — not an error, not double-counted.
- **An event for a revoked connection**: `400`.
- **A connection from a different organization**: rejected by the same
  cross-tenant check pattern as every other module.

## Acceptance tests

- `packages/connectors/src/generic-webhook-adapter.test.ts` — 11 unit
  tests: rejects a missing/wrong signature, rejects invalid JSON even
  when correctly signed, uses the payload's own id as the idempotency
  key when present, derives a stable key from the body when it isn't,
  correct health status transitions (connected/no-events, degraded
  after 7+ days, reflects a non-connected status), and confirms
  `sync`/`execute`/`reconcile` report their not-applicable results
  rather than throwing.
- `apps/web/src/lib/services/connection.integration.test.ts` — 9 tests
  against real Postgres: rejects a member without
  `organization:manage`; rejects an empty name; creates a connection
  with a real 64-hex-char secret that is never stored in plaintext;
  accepts and records a correctly signed event; rejects a badly signed
  one; **dedupes a replayed event** (confirmed via `eventCount`
  unchanged on the second delivery); rejects an event for a revoked
  connection; lists connections scoped to the organization; rejects
  revoking a connection from a different organization.
- Manual smoke test performed for this slice against the real running
  server: created a connection via the API, computed a real HMAC-SHA256
  signature with `openssl` from the shell, sent it with `curl` to the
  actual webhook endpoint and got `200 {"deduped": false}`, replayed
  the identical request and got `200 {"deduped": true}`, sent a request
  with a deliberately wrong signature and got `401 "Invalid webhook
  signature."`, and confirmed the Integration Center page rendered the
  connection with the correct real event count (1, not 2) and health
  detail; dev database reset to a clean seeded state afterward.
