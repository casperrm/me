# Module: Notifications and Alerts

Status: **Implemented (Phase 1 slice)**. Bible reference: Section 30
("In-app notification center with severity, category, client/resource,
action, read/acknowledged state" and "Escalation rules for overdue
approvals, project risk, ... and failed workflows"). Also gives
`apps/worker` its first real job, closing the Phase 0 note that its
queue runtime "carries no real job yet" (ADR-004).

## Purpose

A user-facing inbox that tells the right people, automatically, when
something needs their attention on a client they can write to: an
approval waiting on them, a Quality Control failure, a failed content
publish, or an overdue deliverable — without anyone having to go looking
for it.

## Scope boundary — stated explicitly

Section 30 also lists "payment risk" and "integration degradation" as
escalation triggers. Payment risk is now built — a follow-up slice
added it once real invoicing existed to source it from (`Invoice.dueAt`/
`.status`, the same data Client Health Score's `payment_status` factor
already uses; at the original writing, invoicing/payment automation
didn't exist yet, which is why this was deferred). Integration
degradation still isn't built: it needs real Phase 4 connectors, which
don't exist. This slice (plus the payment-risk follow-up) covers every
escalation trigger that has real, non-stubbed data behind it: overdue
tasks/projects/content/invoices, approval requests, Quality Control
failures, and failed content-calendar publishes. Email/push notification
channels (Section 30: "may be added through adapters and user
preferences") are also not built — in-app only for now.

## Entities

| Model | Notes |
|---|---|
| `Notification` | `severity` (`INFO \| WARNING \| CRITICAL`), `category` (a stable string per trigger — see below), optional `clientId`/`resourceType`/`resourceId`, `title`/`body`/`actionUrl`, `status` (`UNREAD \| READ \| ACKNOWLEDGED`). Recipient is a `Membership`, never a bare `User` — a notification is inherently org-scoped. |

## The two building blocks (`packages/events/src/notifications.ts`)

- **`emitNotification`** — the low-level, unauthorized writer (same
  pattern as `emitAuditEvent`). Called by trusted application code that
  already knows this membership should be told something.
- **`notifyClientWriters`** — the standard fan-out: finds every `ACTIVE`
  membership in the org and, for each, calls the real `isAuthorized`
  check for `clients:write` on the given client (excluding an optional
  actor). This means the recipient list can never drift from "who can
  actually act on this client" — it's the same authorization decision
  every write operation already uses, not a separate "who owns this
  client" query that could get out of sync.
- **`hasRecentNotification`** — Section 30: "Deduplicate noisy alerts."
  Checks whether a notification for the same `resourceType` +
  `resourceId` + `category` already exists within a caller-supplied
  window. Used by the escalation job so an overdue item is re-escalated
  on a cadence (24h), not on every scan.

## Triggers

| Category | Where | Severity |
|---|---|---|
| `approval_requested` | `requestApproval` (`creative-service.ts`) | `CRITICAL` if the automatic Quality Control run (see `docs/specs/quality-control.md`) came back `fail`, `WARNING` if `warning`, else `INFO`. |
| `content_publish_failed` | `setContentCalendarItemStatus` moving to `FAILED` | `WARNING`, body is the failure reason. |
| `task_overdue` / `project_overdue` / `content_overdue` | `apps/worker`'s escalation job | `WARNING`, deduplicated 24h per resource. |
| `invoice_overdue` | `apps/worker`'s escalation job | `CRITICAL` (payment risk — unpaid revenue past due — is weighted heavier than a deliverable slipping, matching Client Health Score's own reasoning for weighting `payment_status` heaviest), deduplicated 24h per resource. |

Every trigger excludes the acting member from their own notification
(via `excludeMembershipId`) — a person doesn't need to be told about
their own action, except the escalation job, which has no "actor" to
exclude.

## The worker job (`apps/worker/src/jobs/escalations.ts`)

Scans overdue `Task`s (`dueDate` past, `status != "done"`), `Project`s
(`dueDate` past, `status` not `DELIVERED`/`ARCHIVED`), and
`ContentCalendarItem`s (`dueDate` past, `status` not
`PUBLISHED`/`FAILED`); for each not already escalated in the last 24h,
calls `notifyClientWriters`. Registered in `apps/worker/src/index.ts` as
a BullMQ repeatable job on a new `escalations` queue, hourly, with
`immediately: true` so a worker restart doesn't leave already-overdue
items waiting up to an hour for their first check.

## Permissions

`emitNotification`/`notifyClientWriters` are internal, unauthorized
writers — never exposed directly to a route handler. Every
`notification-service.ts` read/write function (`listNotifications`,
`unreadNotificationCount`, `markNotificationRead`,
`markNotificationAcknowledged`, `markAllNotificationsRead`) takes the
caller's own `membershipId` and verifies ownership before acting — a
notification is a personal inbox, never something one member reads or
acknowledges on another's behalf.

## UI

- `/notifications` — full list, newest first, with severity/category
  badges, the client name, a mark-read link-through on the title, and
  per-row "Mark read"/"Acknowledge" actions plus a "Mark all read"
  action.
- The `(app)` sidebar's "Notifications" link shows a live unread-count
  badge.

## Failure modes

- **QC check errored during `requestApproval`**: already handled
  upstream (QC is advisory — see `docs/specs/quality-control.md`); the
  notification still fires with `qcOverallStatus` undefined, i.e. `INFO`
  severity.
- **Acting on another membership's notification**: rejected — every
  notification-service function checks `{ id, membershipId }` together,
  not `id` alone.
- **Escalation job re-run before the dedupe window expires**: correctly
  produces zero new notifications — verified directly against a real
  running worker process and Redis in this slice's smoke test.

## Acceptance tests

- `apps/web/src/lib/services/notifications.integration.test.ts` — 5
  tests against real Postgres: `notifyClientWriters` notifies every
  active client-writer and excludes the actor, `hasRecentNotification`
  correctly distinguishes by category and time window, an approval
  request notifies client writers with QC-aware severity, a
  content-calendar `FAILED` transition notifies client writers, and the
  notification-service read/acknowledge functions are correctly scoped
  to the caller's own membership (including rejecting a cross-membership
  attempt).
- `apps/worker/src/jobs/escalations.integration.test.ts` — new in the
  payment-risk follow-up slice, the first real test coverage
  `escalations.ts` ever had (previously untested since it was written,
  despite being `apps/worker`'s very first job). 3 tests against real
  Postgres: a real overdue task, project, content item, and invoice each
  escalate exactly once in a single scan (asserting the invoice's real
  `CRITICAL` severity and a title carrying the real formatted amount),
  re-running the scan immediately produces zero further notifications
  (the 24h dedupe window), a paid invoice past its due date is never
  escalated, and an invoice not yet due is never escalated.
- Manual smoke test performed for this slice against the real running
  server and a real running `apps/worker` process against Redis:
  invited and accepted an ADMIN user, requested an approval as the
  owner and confirmed the admin received an `approval_requested`
  notification with the correct action URL and an unread sidebar badge,
  confirmed marking it read cleared the badge, created a real overdue
  `Task` row, ran the actual worker process against real Redis and
  Postgres and confirmed it escalated the task to both client-writers
  automatically, and confirmed a second scan correctly deduplicated
  (zero new notifications) rather than re-escalating the same task.
- Manual smoke test performed for the payment-risk follow-up slice:
  created a real overdue unpaid `Invoice` for the seeded demo client
  through the running server, ran the actual `apps/worker` process
  against real Redis and Postgres, confirmed via `psql` a real
  `Notification` row was created with `category = "invoice_overdue"`,
  `severity = "CRITICAL"`, and the correct formatted-dollar title,
  confirmed it rendered on `/notifications` with the correct action URL
  (the client's own page), and confirmed a second scan produced no
  duplicate; the test invoice and its notification were deleted
  afterward.
