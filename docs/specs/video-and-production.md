# Module: Video Studio & Photography/Production

Status: **Implemented (Phase 2 slice)**. Bible reference: Section 11
(11.1 AI Video Studio, 11.2 Photography / Production Module).

## Purpose

Section 11.1: pre-production planning for a video creative — concept,
hook, storyboard, script, shot plan, voice-over copy, subtitle/caption
copy, edit instructions, music/asset notes, platform variants — versioned
so "what was planned when" is always answerable, with the final video
file going through the existing approval pipeline rather than a parallel
one.

Section 11.2: shoot scheduling — locations, contacts, crew, roles,
equipment, permits, call sheet, shot list, product list, references, and
status — for photography/production work tied to a client (and optionally
a project).

**Scope boundary, stated explicitly:** both of these sections describe AI
assistance ("AI can prepare shot lists, angle ideas, schedule
suggestions, and equipment planning") that isn't built here — Cedar
Command Center's AI orchestration is still a thin routing stub (ADR-007),
and no video-generation or AI production-planning integration exists yet.
This slice builds the **data model and workflow** a human plans against;
AI assistance on top of it is Phase 3+ territory once the AI Foundation
work lands.

## Entities

| Model | Notes |
|---|---|
| `VideoBrief` | 1:1 with a `Creative` (typically `type: "video"`, not DB-enforced). Tracks `currentVersion`, same pattern as `BrandProfile`. |
| `VideoBriefVersion` | Versioned pre-production fields (concept, hook, storyboardNotes, script, voiceoverCopy, captionCopy, editInstructions, musicNotes, platformVariants as JSON). A save always inserts a new row — never mutates the previous version, so "what was planned when" stays answerable (Section 11.1: "version scripts and edits"). |
| `Shoot` | Belongs to a `Client`, optionally a `Project`. List-shaped fields (crew, equipment, permits, shot list, product list, references) are JSON columns — the same pragmatic choice already made for `Client.services` and `BrandProfileVersion`'s colors/fonts/patterns. `status`: `PLANNED \| CONFIRMED \| COMPLETED \| CANCELED`. |

Approval, publishing, and performance for the **final** video file are
explicitly not reimplemented here — Section 11.1 says to "connect each
final video to campaign, client, approval, publishing, and performance,"
which is exactly what happens automatically once the finished file is
uploaded as the `Creative`'s current `CreativeVersion.asset` and run
through the existing Section 15.1 approval pipeline (`docs/specs/approvals.md`).
`VideoBrief` only covers the planning stage before that point.

## Permissions

Both `saveVideoBrief` and `createShoot`/`setShootStatus` require
`clients:write` on the owning client, same as every other write in the
Campaigns/Creatives/Content Calendar family. Reading either requires
`clients:read`.

## Events

`video_brief.version_created`, `shoot.created`, `shoot.status_changed`
(audit).

## APIs / entry points

- `POST /api/creatives/[creativeId]/video-brief` — `{ concept?, hook?,
  storyboardNotes?, script?, voiceoverCopy?, captionCopy?,
  editInstructions?, musicNotes?, platformVariants?: string[] }` — always
  creates a new version.
- `POST /api/clients/[id]/shoots` — `{ title, projectId?, scheduledAt?,
  location?, crew?, equipment?, permits?, callSheetNotes?, shotList?,
  productList?, references? }`
- `POST /api/shoots/[shootId]/status` — `{ status }`

## UI

- A "Video brief (Section 11.1)" card on the Creative detail page,
  shown only when `creative.type === "video"` and the actor can write —
  a form pre-filled from the latest version; saving always creates the
  next version rather than editing in place (the UI states this
  explicitly so it isn't mistaken for an in-place edit).
- `/clients/[id]/shoots` — a per-client shoot list with a create form
  (title, project, date, location, call sheet notes) and an inline
  status control; crew is rendered as chips when present.
- Both pages are linked from the client profile page (`/clients/[id]`),
  next to the Content Calendar link.

## Jobs

None. Synchronous, same as the rest of Phase 2.

## Failure modes

- **Video brief save for a creative outside the caller's organization or
  client:** rejected with `AuthError`/`AuthorizationError` the same way
  as every other module.
- **Shoot linked to a project belonging to a different client:**
  rejected at creation.
- **Shoot status update for a shoot in a different organization:**
  rejected — the service re-verifies `Shoot -> Client -> organizationId`
  before checking permission, same pattern as every other module.

## Acceptance tests

- `apps/web/src/lib/services/video-and-production.integration.test.ts` —
  5 tests against real Postgres: `saveVideoBrief` creates version 1 then
  version 2 without mutating version 1, permission rejection for a role
  without `clients:write`, `createShoot`/`setShootStatus` walking
  PLANNED → CONFIRMED → COMPLETED with crew/equipment/shot-list data
  persisted, rejection of a cross-client project link, and rejection of
  a status update for a shoot in a different organization.
- Manual smoke test performed for this slice against the real running
  server: created a video creative, saved two video brief versions via
  the API, confirmed the Creative detail page rendered the latest
  version's content pre-filled into the form, created a shoot with a
  project/location, confirmed it rendered on `/clients/[id]/shoots`, and
  confirmed a PLANNED -> CONFIRMED status transition succeeded.
