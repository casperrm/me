# Data model: updatedAt on collaboratively-edited records

Bible reference: Section 27.1 (Data Architecture and Database Rules) —
"created_at, updated_at, created_by/updated_by where meaningful."

## The gap

A survey of `packages/db/prisma/schema.prisma`'s 46 models found only 10
had `updatedAt` at all (`Organization`, `User`, `Membership`, `Client`,
`BrandProfile`, `Project`, `VideoBrief`, `Shoot`, `ContentCalendarItem`,
`AiBudget`). Three of the models missing it are genuinely,
collaboratively mutated in place by multiple team members, with
previously no way to know when: **Task** (status/priority/assignee/due
date all change after creation), **Creative** (status transitions
through the whole approval lifecycle — `DRAFT` → `PENDING_APPROVAL` →
`APPROVED`/`REJECTED` — mutate the same row), and **Meeting** (`notes`
is edited in place via `updateMeetingNotes`, and `decisions`/`followUps`
are appended to over time).

## Why only these three, not all 36

Most of the remaining models correctly have no `updatedAt` — this
isn't an oversight to fix broadly:

- **Append-only audit/telemetry rows** (`AuditEvent`, `CedarBrainRequest`,
  `AiEvalRun`, `AiEvalResult`, `CedarPromptSnapshot`, `WorkerJobFailure`,
  `ConnectionEvent`) are written once and never mutated by design —
  adding `updatedAt` to an immutable row would be actively misleading.
- **Version-history records** (`CreativeVersion`, `BrandProfileVersion`,
  `VideoBriefVersion`) represent "a new version was created," not "the
  old version was edited" — the versioning pattern itself is the
  change-tracking mechanism; a generic `updatedAt` would duplicate that.
- **Short-lived security/state-tracked artifacts** (`Session`,
  `Invitation`, `MfaRecoveryCode`, `PendingMfaLogin`) already track their
  own specific lifecycle transitions explicitly (`revokedAt`,
  `acceptedAt`, etc.) — a generic `updatedAt` would be a worse, less
  specific signal than what's already there.
- **Genuinely-immutable-once-created records with no edit feature**
  (`TaskComment`, `Note`, `Expense`) — nothing in this app currently lets
  a user edit these after creation, so `updatedAt` would sit unused,
  same failure mode as `Invoice.currency` (a real field in this schema
  that's set once and never read anywhere in the app — checked via grep
  before deciding what to add here, specifically to avoid repeating that
  mistake).

This is a deliberately narrow, mechanical fix (add a column, let
Prisma's `@updatedAt` manage it — zero required application-code
changes for the timestamp itself to start working), not a blanket schema
sweep.

## What's built

- `updatedAt DateTime @updatedAt` added to `Task`, `Creative`, `Meeting`.
  Migration `20260910002428_task_creative_meeting_updated_at` backfills
  existing rows to the migration time (their real prior update time
  isn't recoverable) via a temporary DB default, immediately dropped in
  a follow-up migration to match Prisma's own `@updatedAt` semantics
  (managed at the application layer, not a DB-level default) — the
  standard, idiomatic pattern for this attribute in Prisma.
- Surfaced in the UI so the field is provably real, not another
  write-only column: the Creative detail page and Meeting detail page
  each show "Last updated {timestamp}" under the title; the project
  page's compact task list rows carry it as a native `title` tooltip
  (chosen over inline text specifically to avoid cluttering an already
  dense row — the same "make it visible without touching the row
  layout" consideration other slices in this project have applied).

## Testing

- One new test each in `project-and-calendar.integration.test.ts`,
  `creative-service.integration.test.ts`, and
  `meeting-service.integration.test.ts`: captures `updatedAt` right
  after creation, performs a real mutation (`setTaskStatus`,
  `requestApproval`, `updateMeetingNotes`), and asserts the new
  `updatedAt` is strictly greater than the original.
- Live-verified against a real running production build: changed a real
  task's status through the actual UI dropdown, confirmed via `psql`
  that both `status` and `updatedAt` changed on the real row, then
  confirmed via a real headless-Chromium check that the task row's
  tooltip in the UI reflected the new, real timestamp — not a stale or
  cached value. Cleanup: reverted the task's status, deleted the
  incidental checklist-item row and audit event created while locating
  the correct UI control during the smoke test.
