# Expense Editing and Deletion

- **Status:** Implemented (first cut)
- **Bible sections:** 4.2 (Client Health/Profitability signals), 16
  (Finance Hub)

## The gap

`expense-service.ts` exported exactly one function, `createExpense`.
`prisma.expense.update`/`prisma.expense.delete` had zero non-test call
sites anywhere in the app; no `PATCH`/`DELETE` route existed under
`/api/expenses`; and `/clients/[id]/expenses/page.tsx` rendered its list
as plain read-only `<li>` text (date/category/amount), with no edit or
delete affordance even for a `finance:write` holder who could already see
the "+ Log expense" action on the same page.

This mattered beyond ordinary CRUD completeness: once logged, a
fat-fingered `amountCents` or wrong `category` was permanent, and that
number flows directly into `getClientProfitability`,
`getProjectProfitability`, `getCampaignProfitability`, the CEO
Dashboard's cost aggregate, and the AI Business Advisor's cost-leakage
signal — a silent, uncorrectable data-integrity problem in exactly the
systems recent slices (project-level profitability attribution, dashboard
aggregates) have been hardening for correctness.

## What was built

`apps/web/src/lib/services/expense-service.ts` gained `updateExpense`
and `deleteExpense`:

- Both gated on `finance:write`, **org-wide** — the same tier
  `createExpense` already uses. (Unlike `updateClient`, this can't be
  client-scoped: `Expense.clientId` is optional — a general overhead
  cost has none — so there's no single client to scope the permission
  check to.)
- `updateExpense` takes `category`/`amountCents`/`description`/
  `incurredAt` as independently optional fields — only what's passed is
  validated and changed, rejects a zero-field call, and emits a real
  `AuditEvent` with a genuine `{before, after}` diff of only what
  actually changed (no event when nothing did), the same shape
  `updateClient` established.
- `deleteExpense` removes the row and emits an `AuditEvent` carrying a
  full snapshot of what was deleted — since the row itself is gone
  afterward, the audit trail is the only remaining record.

New `PATCH`/`DELETE /api/expenses/[id]` routes, mirroring the sibling
`POST /api/expenses` route's shape.

New `ExpenseRowActions.tsx` — inline "Edit"/"Delete" controls per row on
`/clients/[id]/expenses/page.tsx`'s list, visible only to a
`finance:write` holder (`canWriteFinance`, already computed on that
page). Edit opens an inline form (category/amount/date/description,
pre-filled); Delete asks for confirmation before calling the route.

## Explicit scope boundary — what this deliberately does NOT do

- **No reassigning `clientId`/`projectId`/`campaignId`.** Moving an
  expense to a different client/project/campaign would require
  re-running `createExpense`'s whole hierarchical validation chain (a
  campaign requires its project, which requires its client) and raises
  its own question of whether historical profitability reports should be
  retroactively affected by moving costs between books after the fact.
  This slice fixes "a typo is permanent," not "expenses can be moved
  between books" — a real but separate, larger feature. `updateExpense`
  only accepts `category`/`amountCents`/`description`/`incurredAt`.
- **No `updatedAt` field added to the schema.** `Expense` still has none
  — this slice is content/value edits, not a new timestamped-audit
  mechanism; the `AuditEvent` trail already records who changed what and
  when.
- **No bulk edit/delete.**
- **No Invoice equivalent yet.** `Invoice` has the identical gap
  (`sendInvoice`/`markInvoicePaid` are the only write paths beyond
  `createInvoice` — a DRAFT invoice's amount/due date can't be
  corrected), noted as a real follow-up but out of scope here since it
  involves a state machine (editing should likely be DRAFT-only) that
  Expense doesn't have.

## Testing

- `apps/web/src/lib/services/expense-service.integration.test.ts` (new,
  real Postgres): updates only the fields provided with a correct
  before/after diff; clears `description` to `null` on an empty string;
  emits no audit event when nothing changed; rejects a non-positive
  amount; rejects a zero-field call; rejects a member with no
  `finance:write`; rejects an expense from a different organization —
  and the same org-boundary/permission checks for `deleteExpense`, plus
  confirming the row is actually gone and the deletion snapshot audit
  event is correct.
- `apps/web/src/app/api/expenses/[id]/route.contract.test.ts` (new): 401/
  403/200/400 coverage for both `PATCH` and `DELETE`.
- Full `apps/web` vitest suite: 681/681 passed (103 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15
  packages.
- Production build (`next build`): succeeded.

## Live smoke test

Against a real running production build (fresh `next start`, no stale
process), via real Playwright/Chromium against the real seeded owner
account, on the real seeded "Volt Mobile" client:

1. Logged in, navigated to the client's expenses page, logged a real
   fixture expense through the existing "+ Log expense" form.
2. Clicked "Edit" on that real row, changed its category and amount
   through the real inline form, saved — confirmed the real `PATCH
   /api/expenses/[id]` request returned `200` and the page immediately
   showed the new category text and `$99.99`.
3. Clicked "Delete" on the edited row, confirmed the browser dialog,
   confirmed the real `DELETE /api/expenses/[id]` request returned `200`
   and the row disappeared from the page.
4. Queried Postgres directly and confirmed: the row was genuinely
   deleted; a full `expense.created` → `expense.updated` (with the
   correct before/after diff) → `expense.deleted` (with a correct
   snapshot) audit trail existed for that one fixture expense.
5. Deleted the three fixture audit events afterward and confirmed the
   dev database's two seeded org-wide expenses (Software, Contractor —
   both with no `clientId`, untouched by this test) matched their exact
   original values.
