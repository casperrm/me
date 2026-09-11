# Client Note Creation

- **Status:** Implemented (first cut)
- **Bible section:** 4 (Client Management)
- **Date:** 2026-09-11

## The gap

Immediately after closing the client-creation gap
(`docs/specs/client-creation.md`), a quick sanity pass over other primary
entities' creation paths (Campaign, Creative, Task, Project — all
confirmed real) surfaced the same shape one level down: `prisma.note.create`
had **zero non-test call sites anywhere in the app**. Both places that
read `Note` rows — the client detail page's "Notes" preview card and the
dedicated `/clients/[id]/notes` list page (`getPaginatedNotes`,
`client-relations-service.ts`) — were read-only. There was no form, no
API route, no server action that could ever produce a new `Note` row
outside the seed script and test fixtures.

## What was built

`apps/web/src/lib/services/note-service.ts` exports `createNote(params)`:

- Gated on `clients:write`, **scoped to the note's client** (not org-wide)
  — a note only ever makes sense in the context of a client that already
  exists, the same tier `createProject`/`createShoot`/`createExpense`
  already use for their own client-scoped writes.
- Validates `body` (trimmed, non-empty).
- Emits a real `AuditEvent` (`action: "note.created"`, `resourceType:
  "Note"`, `resourceId`/`clientId`).

New `POST /api/clients/[id]/notes` route, mirroring
`POST /api/clients/[id]/shoots`'s exact shape (401/400/403/200).

New `AddNoteForm.tsx` (`apps/web/src/app/(app)/clients/[id]/`) — a small
textarea + submit button, matching `MeetingDecisions.tsx`'s
append-to-list pattern (clears itself and calls `router.refresh()` on
success, rather than replacing a single field like
`MeetingNotesForm.tsx` does for a meeting's one free-text notes field).
Wired into both surfaces that previously only read notes: the client
detail page's "Notes" card and the dedicated `/clients/[id]/notes` list
page, each gated on the viewer's own `clients:write` for that client.

## Explicit scope boundary — what this deliberately does NOT do

- **No note editing or deletion.** `Note` has no `updatedAt` and this
  slice doesn't add one — notes are treated as an append-only log here,
  matching how `ClientTimelineEvent` and `AuditEvent` already behave in
  this codebase. A correction is a new note, not an edit to an old one.
- **No author attribution on the `Note` row itself.** The schema
  (`packages/db/prisma/schema.prisma`) has no `authorId`/`createdBy`
  field on `Note`, and this slice doesn't add one via migration — who
  wrote a note is still recoverable from the `AuditEvent` this slice
  emits (`actorId` → `Membership` → `User`), the same indirection the
  Audit Log viewer already relies on for other resources. Rendering "by
  <name>" directly on each note in the UI is a reasonable follow-up, not
  required to close "there's no way to add a note at all."
- **No rich text / attachments on notes.** Plain text only, matching the
  schema's single `body: String` field.

## Testing

- `apps/web/src/lib/services/note-service.integration.test.ts` (new, real
  Postgres): creates a real note with a real audit event; rejects an
  empty body; rejects a member with no `clients:write` for that client;
  rejects a client from a different organization.
- `apps/web/src/app/api/clients/[id]/notes/route.contract.test.ts` (new):
  401 signed out, 400 missing body, 403 for a DESIGNER without
  `clients:write`, 200 persisting a real row, 400 for a client in a
  different organization.
- Full `apps/web` vitest suite: 650/650 passed (100 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15
  packages.
- Production build (`next build`): succeeded.

## Live smoke test

Against a real running production build (fresh `next start`, no stale
process), via real Playwright/Chromium against the real seeded owner
account:

1. Logged in as the seeded OWNER, navigated to `/clients`, opened the
   real "Volt Mobile" client's detail page.
2. Confirmed the Notes card now renders the add-note textarea, filled it
   in, and submitted — confirmed the real `POST
   /api/clients/[id]/notes` request returned `200` with a real `noteId`,
   and the new note appeared in the card immediately after.
3. Navigated to the dedicated `/clients/[id]/notes` list page, confirmed
   the note from step 2 is visible there too (same underlying data,
   different surface), then added a second note directly from that
   page's own form and confirmed it appeared.
4. Queried Postgres directly and confirmed both notes and their
   `note.created` `AuditEvent`s existed with the correct
   `resourceId`/`clientId`/`result: SUCCESS`.
5. Deleted both fixture notes and audit events directly in Postgres
   afterward and confirmed the dev database returned to its exact seeded
   baseline (the one original seeded note, unchanged).
