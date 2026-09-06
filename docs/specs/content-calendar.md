# Module: Content Calendar

Status: **Implemented (Phase 2 slice)**. Bible reference: Section 9
(Content Planning and Publishing). Distinct from Section 12's due-date
calendar (`docs/specs/projects-and-calendar.md`), which this module now
feeds into rather than duplicating.

## Purpose

The planning/scheduling layer for content across channels: "content
calendar with client, channel, campaign, content pillar, format, owner,
status, due date, approval, publish time, and linked assets." Answers
"what's going out, where, and when" independently of whether the
underlying creative work has even started.

## Entities

| Model | Notes |
|---|---|
| `ContentCalendarItem` | Belongs to a `Client`; optionally links a `Campaign` and a `Creative` (so a content item can point at the actual asset going through the Section 15.1 approval pipeline). `owner` is a `Membership`. No `organizationId` column — like `Campaign`/`Creative`, org scope is enforced by joining through `Client`. |

Approval is deliberately **not** reimplemented here — a linked `Creative`
already carries the full approval state machine (`docs/specs/approvals.md`).
This model only tracks the content item's own planning-stage status.

## The state machine

`status`: `BRIEF | DRAFT | INTERNAL_REVIEW | CLIENT_APPROVAL | SCHEDULED |
PUBLISHED | FAILED`, following Section 9's workflow (brief -> draft ->
internal review -> client approval when required -> scheduled/ready ->
publish -> performance -> learning) as far as this phase can go without a
real publishing connector:

```
BRIEF -> DRAFT -> INTERNAL_REVIEW -> CLIENT_APPROVAL -> SCHEDULED -> PUBLISHED
                        |                    |              |
                        +--------- DRAFT <---+              +-> FAILED -> SCHEDULED | DRAFT
```

- `INTERNAL_REVIEW` and `CLIENT_APPROVAL` can both go back to `DRAFT`
  (changes requested).
- `SCHEDULED` can move to `PUBLISHED`, back to `DRAFT`, or to `FAILED`.
- `FAILED` requires a `failureReason` and can move to `SCHEDULED` (retry)
  or `DRAFT` (rework). This is the buildable form of Section 9's "failed
  publishes create actionable alerts, preserve payload/error metadata,
  and support safe retry" — there is no real connector yet (Phase 4), so
  nothing actually fails on its own; a human marks it failed and the
  reason is preserved the same way a real connector failure would be.
- `PUBLISHED` is terminal in this phase. **Important scope boundary:**
  `PUBLISHED` means "the plan says this went out," not "an authorized
  connector call to Meta/TikTok/etc. succeeded" — there are no real
  platform credentials wired up yet (see ADR-002/003 territory, Phase 4).
  Every allowed transition is enforced server-side in
  `content-calendar-service.ts`'s `ALLOWED_TRANSITIONS`; the UI's copy of
  that table is cosmetic only (an out-of-date client list can only be
  overly permissive in the dropdown, never a security gap, since the
  server re-validates).

## Permissions

Creating and transitioning items both require `clients:write` on the
owning client — same model as Projects/Campaigns/Creatives. Reading the
plan requires `clients:read`.

## Events

`content_calendar_item.created`, `content_calendar_item.status_changed`
(audit).

## APIs / entry points

- `POST /api/clients/[id]/content` — `{ title, channel, campaignId?,
  creativeId?, contentPillar?, format?, ownerId?, dueDate?, publishAt? }`
- `POST /api/content/[itemId]/status` — `{ status, failureReason? }`
  (`failureReason` required when `status === "FAILED"`)

## UI

- `/clients/[id]/content` — full planning table for one client: title,
  channel, pillar/format, owner, due date, publish date, status badge,
  and (if the actor can write) a status-transition control scoped to
  exactly the statuses currently reachable from the item's current state.
- A "Content Calendar" link on the client profile page (`/clients/[id]`),
  next to the Projects card.
- `/calendar` (Section 12's unified calendar) now includes two new event
  types sourced from this module: `content_due` and `content_publish`.

## Jobs

None. Synchronous, same as the rest of Phase 2's creative/approval work.
A real "execute the scheduled publish" job is Phase 4 territory once a
connector exists.

## Failure modes

- **Invalid status transition** (e.g. `BRIEF` straight to `SCHEDULED`):
  rejected with `AuthError` naming the current and requested status.
- **Marking `FAILED` with no reason:** rejected — Section 9 requires
  preserved error metadata, and an empty reason isn't that.
- **Campaign/creative link to a resource outside the target client:**
  rejected at creation — the same client-isolation discipline as every
  other module in this schema.
- **Member with no `clients:write` on this client:** rejected.

## Acceptance tests

- `apps/web/src/lib/services/content-calendar.integration.test.ts` — 6
  tests against real Postgres: creation, rejection of a cross-client
  campaign link, permission rejection for a role without `clients:write`,
  the full BRIEF → DRAFT → INTERNAL_REVIEW → CLIENT_APPROVAL → SCHEDULED →
  PUBLISHED walk, rejection of skipping a step, and the FAILED/retry path
  (reason required, reason cleared on reschedule).
- `apps/web/src/lib/services/project-and-calendar.integration.test.ts` —
  extended to assert `getUpcomingEvents` includes `content_due` and
  `content_publish` alongside the pre-existing task/project/invoice
  event types, still correctly scoped by client.
- Manual smoke test performed for this slice against the real running
  server: created a content item via `/api/clients/[id]/content`,
  confirmed it rendered on `/clients/[id]/content`, confirmed an invalid
  `BRIEF -> SCHEDULED` transition was rejected with 400 while `BRIEF ->
  DRAFT` succeeded, and confirmed the item's due date appeared as a
  "Content" event on `/calendar`.
