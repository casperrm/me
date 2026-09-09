# Module: Meetings and Decision Capture

Status: **Phase 1 slice (record-keeping half only)**.
Bible reference: Section 13.

## Purpose

Section 13's full text: "Meeting record: participants, client/project,
agenda, notes/transcript reference, summary, decisions, action items,
owners, deadlines, follow-ups. Decisions are first-class records with
rationale, approver, date, affected resources, and evidence. Approved
meeting decisions update relevant client/project context and can be
promoted into memory."

That is a large, partly AI-dependent, partly speculative vision. This
slice builds the smallest real cut: a human logs a meeting (client-scoped
or internal), writes notes, records decisions and follow-ups, and can
promote a follow-up into a real, trackable `Task` — the concrete,
buildable half of "approved meeting decisions update relevant
client/project context."

## What's not built (and why)

- **Transcript capture / AI-generated summary.** No audio or
  transcription infrastructure exists anywhere in this codebase, and
  `ANTHROPIC_API_KEY` is unset in every environment this has been built
  in so far — the same reason every other AI-dependent feature in this
  session (Business Advisor's narrative, Cedar Brain itself) is
  deliberately optional/stubbed rather than assumed. `Meeting.notes` is a
  plain field a human types into, not a transcript reference.
- **Decisions as a first-class approval workflow.** Section 13 asks for
  decisions with "rationale, approver, date, affected resources, and
  evidence" — effectively a second approval engine. This slice's
  `addMeetingDecision` is deliberately a simple, user-entered record
  (`text`, optional `rationale`, `createdAt`) with no approver field, no
  evidence attachment, and no affected-resources linkage. Building a real
  approver/evidence workflow for meeting decisions would duplicate
  Section 15.1's existing Approval engine (`Approval`/`CreativeVersion`)
  for a different resource type — real scope creep for a first cut, not
  a decision made here.
- **"Promoted into memory."** Agency Memory (Section 6.6's fuller form —
  curation, cross-client pattern extraction, outcome measurement) does
  not exist yet; `docs/specs/client-memory.md` already documents this as
  a real, deliberate gap, not an oversight. This slice's one real
  "promotion" is `promoteFollowUpToTask`: turning a follow-up into a real
  `Task` that the existing Project/Task module (Section 12) already
  tracks, reusing `createTask` rather than reimplementing task creation
  or inventing a memory system that doesn't exist.
- **Agenda.** Not modeled — `Meeting` has no `agenda` field. Nothing in
  this slice reads or writes one; adding an unused column would be
  speculative.

## Entities

| Model | Package | Notes |
|---|---|---|
| `Meeting` | `@cedar/db` | Carries `organizationId` directly (not derived through `client`) — see Schema fixes below. `clientId` is optional: an internal, non-client meeting (an agency team meeting) is a real case. `decisions`/`followUps` are JSON-string columns, parsed/re-stringified by the service the same way other JSON-string columns in this codebase already are (`Client.services`, `CreativeVersion.checks`). |
| `MeetingAttendee` | `@cedar/db` | Join row between `Meeting` and `Membership` (not `User` — see Schema fixes below). |

A decision entry: `{ id, text, rationale: string \| null, createdAt: ISO
string }`. A follow-up entry: `{ id, text, ownerMembershipId: string \|
null, dueDate: ISO string \| null, promotedTaskId: string \| null }`.

## Schema fixes (this slice)

`Meeting`/`MeetingAttendee` were scaffolded early alongside the core
domain models but had zero rows in either table in both the dev and test
databases before this slice (confirmed via `psql` — safe to restructure
with no data-migration risk) and no service, API route, UI, or test
anywhere in the codebase referenced them. Two real, pre-existing bugs
were fixed as part of building on top of them, in one migration:

1. **`Meeting` had no `organizationId`.** Every other tenant-scoped table
   in this schema carries `organizationId` directly (Section 27.1). Since
   `Meeting.clientId` is optional, a clientless `Meeting` row would have
   had *no organizational scope at all* — a real Section 38
   tenant-isolation gap, not a hypothetical one. Fixed by adding
   `organizationId String` (required, indexed) with a matching
   `Organization.meetings` back-relation.
2. **`MeetingAttendee.userId` pointed at `User`, inconsistent with every
   other actor-reference in this schema.** `Task.assigneeId`,
   `TaskComment.membershipId`, `Asset.uploadedBy` all point at
   `Membership` (the org-specific role/identity), never at the bare
   global `User` — `User`'s own doc comment notes it may belong to
   multiple organizations later, so a bare `userId` here would carry no
   org context, unlike everywhere else. Fixed by renaming
   `MeetingAttendee.userId`/`user` to `membershipId`/`membership`,
   pointing at `Membership`. `User.meetings` was removed (User no longer
   directly relates to it); `Membership.meetingAttendances` was added.

## Permissions

There is no `meetings:*` permission in `packages/domain/src/roles.ts`'s
catalog, and this codebase's established convention (see that file's own
doc comment: "Extend it as each module lands rather than pre-declaring
permissions nothing checks yet") is to reuse an existing permission
rather than invent a narrow new one for a first cut.
`project-template-service.ts`'s template-management functions are the
most recent precedent for exactly this "sometimes client-scoped,
sometimes org-wide" shape, and every meeting-service function follows it
exactly:

- A meeting tied to a client (`clientId` set) is gated on
  `clients:write` (writes) / `clients:read` (reads) **with** that
  `clientId` — a scoped collaborator can log/edit/read meetings only for
  clients they already have that grant for.
- An internal meeting (`clientId` null) is gated on the same permissions
  **with no `clientId`** — `can()` (`packages/domain/src/policy.ts`)
  resolves that to OWNER, ADMIN, or an explicit org-wide `ScopedGrant`
  only, never a per-client-only grant. A per-client-scoped collaborator
  can neither create nor read internal meetings, even ones that already
  exist — proven by a dedicated integration test mirroring the same
  boundary test added for project template management.

For every write function, the meeting's *own* scope (its `clientId`, or
org-wide when null) is what's checked — not the caller-supplied
`organizationId` alone — so `updateMeetingNotes`/`addMeetingDecision`/
`addMeetingFollowUp`/`promoteFollowUpToTask`/`getMeeting` all re-derive
the gate from the meeting row itself.

## APIs / entry points

Service (`apps/web/src/lib/services/meeting-service.ts`):

- `createMeeting({ actorUserId, organizationId, clientId?, title, occurredAt?, attendeeMembershipIds? })`
- `updateMeetingNotes({ actorUserId, organizationId, meetingId, notes })`
- `addMeetingDecision({ actorUserId, organizationId, meetingId, text, rationale? })`
- `addMeetingFollowUp({ actorUserId, organizationId, meetingId, text, ownerMembershipId?, dueDate? })`
- `promoteFollowUpToTask({ actorUserId, organizationId, meetingId, followUpId, projectId })` — validates the follow-up hasn't already been promoted (`AuthError` on a second attempt), validates `projectId` belongs to the organization and — when the meeting is client-scoped — to that *same* client (an `AuthError` otherwise, so a client meeting's follow-up can't silently land under a different client's project); an internal meeting's follow-up may promote into any project the actor can write to. Calls the existing `createTask` (`project-service.ts`) rather than reimplementing task creation.
- `getMeeting({ actorUserId, organizationId, meetingId })` — returns attendees joined to `Membership`/`User` for display names, and `decisions`/`followUps` already parsed into arrays (not raw JSON strings).
- `listMeetingsForClient({ actorUserId, organizationId, clientId })`
- `listMeetingsForOrganization({ organizationId, clientIds? })` — follows `calendar-service.ts`/`search-service.ts`'s established contract exactly: `clientIds` is an *already-resolved* scope, not something this function authorizes itself (no `requirePermission` inside it). `undefined` means "every client the caller can read" and returns every meeting including internal ones; a specific array scopes to exactly those clients' meetings and *excludes* internal meetings too, since those aren't part of a scoped reader's granted scope. The caller (the `/meetings` page) computes `clientIds` via `getReadableClientIds` first, exactly like `/calendar`'s page.

API routes (`apps/web/src/app/api/meetings/**`), all following this
codebase's established `AuthorizationError`/`MfaRequiredError`/`AuthError`
per-route catch-block convention:

- `POST /api/meetings` — create.
- `POST /api/meetings/[id]/notes` — update notes.
- `POST /api/meetings/[id]/decisions` — add a decision.
- `POST /api/meetings/[id]/followups` — add a follow-up.
- `POST /api/meetings/[id]/followups/[followUpId]/promote` — promote to a task (`{ projectId }`).

No `GET /api/meetings` route — like `/templates`, the `/meetings` page
is a server component calling `listMeetingsForOrganization`/
`listMeetingsForClient` directly.

## UI

- `/meetings` — the main list (nav item, ungated visibility like
  `/metrics`; the page itself naturally shows a partial/empty list for a
  scoped reader). Computes `clientIds` via `getReadableClientIds` (same
  pattern as `/calendar`'s page) and renders every visible meeting
  (title, client name or "Internal", date, attendee count) linking to
  its detail page, plus a "+ New meeting" form scoped to what the actor
  can actually write to (`getWritableClientIds`, the write-side mirror of
  `getReadableClientIds` added in this slice).
- `/meetings/[meetingId]` — detail page: title, client link or "Internal
  meeting", attendee names, a notes textarea with an explicit "Save"
  button (matching `TaskEstimateForm.tsx`'s explicit-save pattern — a
  half-typed note shouldn't save on every keystroke), a Decisions list
  with an add-decision form, and a Follow-ups list with owner/due-date
  display and either a "Promote to task →" control (project picker
  scoped to the meeting's own client, or every writable project when
  internal) or a "✓ Task created" link to the real task's project page.
- The client 360 page (`/clients/[id]`) gained a compact "Meetings" card
  mirroring the Invoices/Expenses cards' shape: a short recent list plus
  an inline "+ New meeting" form pre-locked to that client
  (`NewMeetingForm`'s `lockClient` prop).

## Scope boundary

Everything under "What's not built (and why)" above stays out of scope
until a real need and a real infrastructure dependency (transcription,
`ANTHROPIC_API_KEY`, Agency Memory) exists to build against. What *is*
real and load-bearing: the record itself, decisions/follow-ups a human
enters, and the follow-up → `Task` promotion that actually moves work
into the existing Project/Task module.

## Test coverage

- `meeting-service.integration.test.ts` (26 tests, real Postgres):
  create with/without `clientId`; attendee validation (rejects a
  cross-org membership id); notes update; decisions accumulate correctly
  across two calls, in order; follow-ups append correctly; promote-to-task
  creates a real `Task` row, sets `promotedTaskId` on the right entry,
  and rejects a second promotion of the same follow-up; promote-to-task
  rejects a project belonging to a different client than the meeting's
  own client and allows any writable project for an internal meeting;
  `listMeetingsForOrganization`'s `clientIds` scoping (`undefined` =
  everything including internal; a specific array excludes both other
  clients' meetings and internal meetings; an empty array returns
  nothing); a dedicated org-wide-vs-per-client permission-boundary test
  proving a per-client-only `ScopedGrant` holder can create/read that
  client's meetings but not an internal (clientless) one, even one that
  already exists.
- Five `*.route.contract.test.ts` files (28 tests total) — one per route
  — covering 401/400/403/200 and real cross-org rejection at the HTTP
  layer.
