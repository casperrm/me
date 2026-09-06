# Module: Brand DNA

Status: **Implemented (Phase 1 slice)**. Bible references: Sections 3, 5.

## Purpose

Store and version each client's brand identity — colors, fonts, tone,
visual style, target audience, products, and approved/rejected creative
patterns with rationale — so the AI (and any human) doesn't need to be
told the brand again for every new task, and so historical creative can
be evaluated against the rules active when it was made.

## Entities

| Model | Package | Notes |
|---|---|---|
| `BrandProfile` | `@cedar/db` | One per client. Tracks `currentVersion`. |
| `BrandProfileVersion` | `@cedar/db` | Append-only — a save always inserts a new row and bumps `BrandProfile.currentVersion`, never mutates a prior version in place. |

## Permissions

- Read: `clients:read` on the owning client (same as the rest of the
  Client 360 page).
- Write (create a new version): `clients:write` on the owning client.

## Events

`brand_profile.version_created` (audit), plus a `client.brand_dna_updated`
`ClientTimelineEvent` row (Section 2: client timeline as the record of
the relationship).

## APIs / entry points

- `POST /api/clients/[id]/brand` — requires `clients:write` on the client;
  body is the full `BrandVersionInput` shape (colors, fonts, toneOfVoice,
  visualStyle, targetAudience, products, approvedPatterns,
  rejectedPatterns). Always creates a new version; there is no "edit
  version N in place" endpoint by design.

## UI

- `/clients/[id]` — read view, shows the latest version's fields plus the
  version number; an "Edit (new version)" / "Add Brand DNA" link appears
  only for actors with `clients:write` on that client.
- `/clients/[id]/brand/edit` — form pre-filled from the latest version;
  dynamic add/remove rows for colors, fonts, and approved/rejected
  patterns (each pattern carries a rationale field, per Section 5).

## Jobs

None. Synchronous.

## Metrics

None instrumented yet.

## Failure modes

- **Client belongs to a different organization / doesn't exist:** the
  service layer re-checks `client.organizationId === actor.organizationId`
  after the permission check (same defense-in-depth pattern as the rest
  of Client Management) and throws rather than silently creating an
  orphaned version.
- **No permission:** route handler returns 403 with a clear message; the
  read page hides the edit link entirely rather than showing a
  disabled/broken control.

## Acceptance tests

- `apps/web/src/lib/services/brand-service.integration.test.ts` — 5 tests
  against real Postgres: version 1 creation, a second save producing
  version 2 without mutating version 1, audit + timeline events recorded
  on every save, a `DESIGNER` with no `clients:write` grant rejected, and
  a client from a different organization rejected.
- Manual smoke test also performed for this slice: logged in as Owner via
  HTTP, posted a new version through `/api/clients/[id]/brand`, confirmed
  the same outcomes end-to-end through the real route handler.
