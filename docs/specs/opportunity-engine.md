# Module: Opportunity Engine

Status: **Implemented (Phase 5 slice)**. Bible reference: Section 4.2
("Opportunity Engine identifies evidence-backed cross-sell/upsell
opportunities and explains the supporting data").

## Purpose

Surfaces, on a client's profile page, concrete cross-sell/upsell
opportunities backed by real evidence from other clients in the same
organization — not a prediction or an AI-generated suggestion, but a
literal count of "other real clients who have X that this one doesn't."

## Scope boundary — stated explicitly

Section 4.2 names opportunity detection as one signal family among many
(alongside health scoring). Only **two signal types** are built here,
both because they are the only ones with a real, already-collected
"what do our other clients have that this one doesn't" comparison
available with no invented data:

- **Service gap**: a service present in `Client.services` for at least
  two other clients in the organization, absent from this client's own
  `services` list.
- **Creative format gap**: a `Creative.type` (format) used in at least
  two other *distinct* clients' creative work, never used for this
  client.

**Not built, and why:**

- **Intent signals** (e.g. a client asking about a service in a call or
  email) — no communication-logging module exists to capture this.
- **Market/industry benchmarking** ("clients in your vertical typically
  buy X") — no external market data source is connected (Phase 4/6
  territory).
- **Trend-based opportunities** ("this client's engagement dropped,
  consider X") — would require time-series campaign performance data
  this system doesn't collect yet.
- **Any AI-generated suggestion** — deliberately not built; every
  opportunity here is a literal, auditable count, not a model's
  judgment call, consistent with the Client Health Score's own
  "decision support, not autonomous truth" framing (Section 4.2).

## The computation (`opportunity-service.ts`)

`getOpportunitiesForClient(clientId, organizationId)`:

- Loads the target client's own `services` and creative `type`s, and
  every *other* client in the same organization's `services` and
  creative `type`s (with each creative format's peer count computed by
  **distinct client**, not distinct creative row — one prolific peer
  making five creatives of the same format is one data point, not
  five).
- A gap is only surfaced when **at least 2 distinct peer clients**
  already have it (`MIN_PEER_COUNT = 2`). One other client having
  something is a coincidence, not evidence of a pattern worth raising
  with this specific client.
- Every opportunity carries its literal `evidence` string (e.g. "2
  other clients in your organization use this service.") and a
  `peerCount`, sorted by `peerCount` descending so the strongest
  evidence surfaces first.
- No schema changes were needed — this is a pure read/compute over
  existing `Client.services` and `Creative.type` data.

## Isolation

Both signals scope every comparison to `organizationId` — a client in a
different organization can never appear as evidence, matching every
other module's cross-tenant isolation guarantee.

## Permissions

`getOpportunitiesForClient` does no authorization itself (same pattern
as `calendar-service.ts`/`search-service.ts`/`profitability-service.ts`
— it takes an already-authorized `organizationId`); its only caller is
the client profile page, which already gates the whole page on the
actor being able to read that client.

## UI

Client profile page (`/clients/[id]`): a new "Opportunities" card,
shown only when at least one opportunity exists, listing each gap's
type (Service/Format badge), label, and evidence string. The card's
header explicitly reads "Decision support, not a recommendation
(Section 4.2)" — the same explainability framing used on the Client
Health Score card, so a human account manager still decides whether a
gap is actually worth raising with this client.

## Failure modes

- **A client with no peers in the organization at all**: returns an
  empty list — no opportunities card renders.
- **A service/format only one other client has**: excluded — below the
  `MIN_PEER_COUNT` evidence threshold.
- **A service/format the client already has**: never surfaced as a gap
  regardless of peer count.
- **A different organization's clients**: never used as evidence.

## Acceptance tests

- `apps/web/src/lib/services/opportunity.integration.test.ts` — 4
  tests against real Postgres: service gap surfaces only when 2+ peers
  have it and the client doesn't (a 1-peer service and the client's own
  service both confirmed excluded); creative format gap surfaces only
  when 2+ *distinct* peer clients have used a format the client hasn't
  (with a dedicated test proving one peer making 5 creatives of the
  same format does not count as evidence on its own); cross-organization
  clients are confirmed never used as evidence for either signal.
- Manual smoke test performed for this slice against the real running
  server: created two temporary peer clients sharing a service absent
  from the seeded client, confirmed the Opportunities card rendered
  with the correct evidence text and peer count via an authenticated
  request, then reset the dev database to a clean seeded state
  (`prisma migrate reset --force`) so no smoke-test artifacts remain.
