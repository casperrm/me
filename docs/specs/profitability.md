# Module: Client Profitability Attribution

Status: **Implemented (Phase 5 slice)**. Bible reference: Section 4.2
("Compute an explainable Client Health Score from configurable signals
... payment status ...") and Section 16/36 Phase 5 ("profitability
attribution by project/service/campaign").

## Purpose

Answers "which clients are actually profitable?" from real invoice and
expense data, instead of only showing an org-wide revenue/expense/net
total (which the CEO Dashboard already had) with no way to see which
client is dragging the average down or carrying it.

## Scope boundary — stated explicitly

Phase 5's own wording asks for attribution "by project/service/campaign."
Only **client-level** attribution is built here:

- **Revenue** is real: `Invoice.clientId` already existed — every
  invoice was already tied to exactly one client.
- **Cost** is real: `Expense.clientId` is new this slice (optional —
  `null` means a genuine org-wide overhead cost like software or a
  non-client-specific contractor, reported as a separate "unattributed"
  total, never guessed at or evenly split across clients).

**Project-level, campaign-level, and service-level attribution are not
built**, and the reasons are concrete, not just "later":

- Project-level would need `Invoice.projectId` and `Expense.projectId`
  — agencies would have to actually tag every invoice and expense at
  that granularity, and no UI exists for that yet. Adding the columns
  without a way to populate them would just be unused schema.
- Campaign-level has no real spend data at all — `Campaign.budgetCents`
  is a manually-set estimate, never reconciled against actual spend.
- Service-level would need billable line items on invoices;
  `Client.services` today is just a tag list, not a billing structure.

Building any of these now would mean inventing data or a UI surface
nobody asked for yet. Client-level is the one cut that's fully real,
fully usable, and required no invented assumptions.

## The computation (`profitability-service.ts`)

`getClientProfitability(organizationId)`:

- **Revenue** = sum of `Invoice.amountCents` where `status = "PAID"`,
  grouped by client. An unpaid or draft invoice isn't recognized revenue.
- **Cost** = sum of `Expense.amountCents` where `clientId` matches,
  grouped by client. Expenses with `clientId = null` are summed
  separately as `unattributedCostCents`.
- **Profit** = revenue − cost. **Margin** = profit ÷ revenue as a
  percentage, or `null` when revenue is 0 (a percentage of nothing isn't
  meaningful — shown as "—" in the UI, never `0%` or `NaN`).

## Entities

| Model | Change |
|---|---|
| `Expense.clientId` | New, optional. `Client.expenses` back-relation added. No change to `Invoice` — it already had `clientId`. |

## The write path (`expense-service.ts`)

`createExpense` is the first place an `Expense` row can ever be created
through the app (previously expenses only ever came from the seed
script) — required to make the `clientId` field ever get populated by a
real user action, not just future direct-DB access. Validates a
positive amount and non-empty category, and — when `clientId` is given
— that the client belongs to the caller's own organization.

## Permissions

`createExpense` requires `finance:write` (the same permission
`finance:read` pairs with on the CEO Dashboard) — recording a cost is a
financial-record write, not a per-client write like `clients:write`,
so it is intentionally not client-scoped the way `clients:write` is.
`getClientProfitability` itself does no authorization (mirrors
`calendar-service.ts`/`search-service.ts`'s pattern of taking an
already-authorized `organizationId`) — its only caller, the CEO
Dashboard, already gates the whole page on `finance:read`.

## UI

- **CEO Dashboard** (`/dashboard`): a new "Client profitability" table
  — client name (linked), revenue, cost, profit (red when negative),
  margin — sorted by profit descending, only listing clients with any
  revenue or cost so a completely untouched client doesn't clutter the
  table. A footer line reports unattributed overhead when present.
- **Client profile page**: a new "Expenses" card listing expenses
  logged against that client, with a "+ Log expense" form (category,
  amount, optional description) visible only to `finance:write` holders.

## Failure modes

- **Non-positive amount or empty category**: rejected.
- **Client from a different organization**: rejected — same
  cross-tenant check pattern as every other module.
- **A client with no invoices or expenses at all**: `revenueCents` and
  `costCents` both 0, `marginPct` is `null` (not `0%`) — and it's
  excluded from the dashboard table entirely rather than shown as a
  confusing all-zero row.

## Acceptance tests

- `apps/web/src/lib/services/profitability.integration.test.ts` — 5
  tests against real Postgres: `createExpense` rejects invalid input
  and a cross-organization client; it creates both a client-attributed
  expense and a client-less (overhead) one; `getClientProfitability`
  counts revenue only from `PAID` invoices (an unpaid invoice for the
  same client is confirmed excluded), correctly separates attributed
  cost from `unattributedCostCents`, and correctly isolates each
  client's cost from another client's expenses.
- Manual smoke test performed for this slice against the real running
  server: confirmed the CEO Dashboard showed the seeded client's real
  paid-invoice revenue and the seed script's overhead expenses
  correctly reported as unattributed, logged a new expense against that
  client via the API, confirmed the dashboard's cost/profit/margin
  figures updated immediately, confirmed the expense appeared on the
  client profile page's new Expenses card, and confirmed an
  unauthenticated request to create an expense was rejected with 401;
  dev database reset to a clean seeded state afterward.
