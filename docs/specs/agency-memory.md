# Cedar Knowledge Promotion v1: Meeting Decision → Agency Memory

- **Status:** Implemented (first cut)
- **Bible sections:** 19.2 (Knowledge Promotion), 6.6 (Memory Layers —
  Agency Memory row), 13 (Meetings AI and Decision Capture)
- **Date:** 2026-09-10

## What Section 19.2 asks for

> Raw AI output is not automatically institutional knowledge. Promotion
> requires an approved outcome, explicit curation, a verified external
> source, or a defined system rule. Store provenance, scope, freshness,
> confidence, and supersession links.

Section 6.6's Memory Layers table names Agency Memory's write policy as
"Curated or outcome-triggered; provenance required," with contents
including "campaigns, creative patterns, SOPs, decisions, lessons." And
Section 13's own text names the first real trigger: "Approved meeting
decisions... can be promoted into memory." Meeting decisions (Section 13,
already built) were sitting right there as a real source with no promotion
path — this slice is that path, not a new capability invented from
nothing.

## What was built

### Schema

`AgencyMemoryEntry` (migration `20260910124021_agency_memory_entries`):
`content`, `sourceMeetingId`, `sourceDecisionId`, `clientId` (nullable —
an internal meeting's decision has none), `promotedByMembershipId`,
`promotedAt`. No `relation()` fields to `Organization`/`Meeting`/`Client`/
`Membership` — this table is only ever queried by its own
`organizationId`, never navigated to *from* those models, so a bare
scalar id avoids touching four unrelated model definitions for a
back-reference array nothing reads (same reasoning `CedarBrainRequest`
already established for its own `organizationId`/`clientId` fields).

`Meeting.decisions`' JSON shape gained `promotedToMemoryId: string | null`
per decision, mirroring `Meeting.followUps`' pre-existing
`promotedTaskId` — the same "has this already been promoted" guard
`promoteFollowUpToTask` already used, reused for decisions.

### How Section 19.2's five required fields map to real data

- **Provenance:** `sourceMeetingId` + `sourceDecisionId` +
  `promotedByMembershipId` trace back to the exact decision and the exact
  human who curated it.
- **Freshness:** `promotedAt`.
- **Scope:** `clientId` — nullable, real, even though Agency Memory itself
  reads org-wide (same Client-Memory-vs-Agency-Memory distinction Section
  6.6's own table draws).
- **Confidence:** deliberately *not* a fabricated numeric score. Explicit
  human curation is the only path that creates a row at all in this v1 —
  every row's existence already is the real confidence signal Section
  19.2 asks for; inventing a percentage on top of that would be a fake
  number dressed up as data.
- **Supersession links:** **not included.** Nothing in this v1 has a real
  trigger to set one — no UI exists to mark one entry as replacing
  another. An always-null column would be exactly the unused scaffolding
  this project's own discipline forbids (see the schema's own doc comment
  and the precedent set by rejecting `Asset.version` earlier in this
  project's history). This is the one field of the five Section 19.2 asks
  for that this slice does not attempt.

### Service

`apps/web/src/lib/services/agency-memory-service.ts`:

- `promoteMeetingDecisionToMemory(params)` — the only write path. Gated
  the same way `addMeetingDecision`/`promoteFollowUpToTask` already gate
  meeting writes (`clients:write`, scoped to the meeting's client when it
  has one, org-wide for an internal meeting). Rejects promoting the same
  decision twice. Emits a real `AuditEvent` (`agency_memory.promoted`).
- `listAgencyMemoryEntries(params)` — org-wide listing (Agency Memory is
  deliberately not client-scoped), gated the same org-wide way
  `listProjectTemplatesForManagement` gates the other shared, curated
  resource in this codebase: `clients:write` with no `clientId`. Resolves
  each entry's client name and promoter name for display.

### UI

- Each recorded decision on a meeting's Decisions card
  (`MeetingDecisions.tsx`) now shows either a "Promote to Agency Memory"
  button or, once promoted, "In Agency Memory" — never both, and the
  promotion is a single explicit click, never automatic.
- New `/memory` page (nav item "Agency Memory", same `clients:write`
  org-wide gate as `/templates`) lists every promoted entry, newest first,
  each with its client, who promoted it, when, and a link back to the
  source meeting. Its own copy states directly why there's no reset/
  override control: nothing is learned or cached here, so there's nothing
  to reset.

## New API route

`POST /api/meetings/[id]/decisions/[decisionId]/promote` — mirrors the
existing `POST /api/meetings/[id]/followups/[followUpId]/promote` route's
exact shape (401 unauthenticated, 403 unauthorized, 400 on a bad/already-
promoted decision id, 200 with the new entry's id on success).

## Tests

- `apps/web/src/lib/services/agency-memory.integration.test.ts` (6 tests)
  against real Postgres: successful promotion (content, client, provenance,
  audit event all verified), rejecting a double promotion, rejecting a
  member with no `clients:write` on the client, rejecting an unknown
  decision id, org-wide listing sorted newest-first with real client/
  promoter names resolved, and rejecting a listing request from a member
  with no org-wide `clients:write`.
- `apps/web/src/app/api/meetings/[id]/decisions/[decisionId]/promote/route.contract.test.ts`
  (5 tests) — the same route-contract shape every other API route in this
  codebase uses (401/403/400/200 cases), mirroring the sibling follow-up
  promote route's own test file line for line where the behavior matches.

## Verification performed

- `npx tsc --noEmit` on `apps/web` and every workspace: clean.
- `npx eslint` on every new/changed file: clean.
- Full `apps/web` vitest suite: 617/617 passed (95 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15 packages.
- Production build (`next build`): succeeded, `/memory` route built.
- Live smoke test against a real running production build, driven entirely
  through the real UI (not direct DB writes): logged in, created a real
  meeting on a real seeded client via the real "New meeting" form, added a
  real decision, clicked the real "Promote to Agency Memory" button,
  confirmed the decision now shows "In Agency Memory" (screenshot-
  verified), then loaded `/memory` and confirmed the real entry appeared
  with the correct client name, promoter name, and timestamp (screenshot-
  verified). All fixture rows (the meeting, its audit events, its
  timeline event, and the memory entry) were deleted afterward and counts
  confirmed back to the pre-test baseline.
