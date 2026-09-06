# Module: Activity Timeline — Task and Invoice Activity

Status: **Implemented (Phase 1 slice)**. Bible reference: Section 42
item 9 area / the Client 360 timeline (`ClientTimelineEvent`), closing
the specific gap `ROADMAP.md` had flagged: "still missing for task/
invoice activity."

## Purpose

`ClientTimelineEvent` already had real writes from Brand DNA saves,
project creation, campaign creation, asset uploads, and creative
approvals. Tasks and invoices were the two client-facing activities
still invisible on a client's history — and invoices had a deeper gap
underneath: there was no real way to *create* one at all before this
slice (they only ever came from the seed script, exactly like `Expense`
before `createExpense` existed).

## What's new

### Invoice write path (`invoice-service.ts`) — the first real one

- **`createInvoice`**: creates a `DRAFT` invoice for a client, gated on
  `finance:write` (same permission `createExpense` uses — recording a
  billing document is a financial-record write, not a per-client write).
- **`sendInvoice`**: `DRAFT → SENT` only; rejects any other starting
  status.
- **`markInvoicePaid`**: `SENT → PAID`, sets `paidAt`; rejects any other
  starting status.

Each transition writes both an audit event (`invoice.created`/
`invoice.sent`/`invoice.paid`) and a `ClientTimelineEvent`.

**Not built**: automatic `OVERDUE` transition (the `Invoice.status`
comment names it, but nothing sets it) — that would need a scheduled
job comparing `dueAt` to now, the same shape as the health-score/
escalation jobs, and is a reasonable follow-up, not required for this
slice since "overdue" is already computed on the fly wherever it's
needed (CEO Dashboard's "Outstanding" stat, Client Health Score's
payment-status signal, the Business Advisor's collection risks) rather
than stored as a status. Storing it too would create two sources of
truth for the same fact.

### Task timeline writes (`project-service.ts`)

- **`createTask`**: now writes a `task_created` timeline event
  alongside its existing audit event.
- **`setTaskStatus`**: writes a `task_completed` timeline event only
  when the transition is *into* `"done"` from a non-`"done"` status —
  every other status flip (e.g. `todo → in_progress`) is routine
  progress tracking, not a client-facing milestone worth surfacing on
  the timeline. Setting an already-`"done"` task to `"done"` again
  (a no-op resubmission) does not create a duplicate event.

## Entities

No schema changes — `ClientTimelineEvent.type` was already a free
string field, and `Invoice` already had `status`/`paidAt`.

## UI

- **Client profile page**: the existing "Invoices" card gained a
  "+ Create invoice" form and per-invoice Send/Mark paid buttons
  (`finance:write` only) — the first UI ever able to write invoice
  data, mirroring the Expenses card's `AddExpenseForm` pattern. The
  existing "Client timeline" card needed no changes — it already
  renders every `ClientTimelineEvent` generically, so the new task/
  invoice event types appear automatically.
- New API routes: `POST /api/invoices`, `POST /api/invoices/[id]/send`,
  `POST /api/invoices/[id]/mark-paid`.

## Permissions

Identical to `expense-service.ts`'s existing pattern: `finance:write`
for every invoice mutation, unscoped by client (a financial-record
write, not `clients:write`). Task timeline writes ride along inside
`createTask`/`setTaskStatus`, which already require `clients:write`
scoped to the task's client — no new permission surface.

## Failure modes

- **Non-positive invoice amount**: rejected.
- **Client from a different organization**: rejected.
- **Sending an already-sent (or paid) invoice**: rejected — `DRAFT →
  SENT` is the only legal send transition.
- **Marking a draft (never-sent) invoice paid**: rejected — `SENT →
  PAID` is the only legal paid transition.
- **An invoice belonging to a different organization**: rejected, same
  cross-tenant check pattern as every other module.

## Acceptance tests

- `apps/web/src/lib/services/invoice.integration.test.ts` — 5 tests
  against real Postgres: rejects a non-positive amount and a
  cross-organization client; creates a draft invoice with its timeline
  event; enforces the `DRAFT → SENT → PAID` transition order in both
  directions (can't mark-paid before sending, can't send twice) with
  both timeline events confirmed written; rejects acting on an invoice
  from a different organization.
- `apps/web/src/lib/services/project-and-calendar.integration.test.ts`
  — extended the existing task lifecycle test to assert a
  `task_created` event exists after `createTask`, a `task_completed`
  event exists after `setTaskStatus(..., "done")`, and that setting the
  same task to `"done"` a second time does not create a duplicate
  completion event.
- Manual smoke test performed for this slice against the real running
  server: created a task via the API and confirmed its `task_created`
  timeline entry; created, sent, and marked an invoice paid via the new
  API routes and confirmed all three timeline entries
  ("created (draft)" / "sent" / "paid") rendered correctly on the
  client profile page, with the invoice's status and no leftover
  action button once `PAID`; dev database reset to a clean seeded state
  afterward.
