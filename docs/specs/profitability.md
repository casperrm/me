# Module: Client Profitability Attribution

Status: **Implemented — client-level, project-level, and campaign-level
(Phase 5 slices)**. Bible reference: Section 4.2 ("Compute an
explainable Client Health Score from configurable signals ... payment
status ...") and Section 16/36 Phase 5 ("profitability attribution by
project/service/campaign").

## Purpose

Answers "which clients are actually profitable?" from real invoice and
expense data, instead of only showing an org-wide revenue/expense/net
total (which the CEO Dashboard already had) with no way to see which
client is dragging the average down or carrying it.

## Scope boundary — stated explicitly

Phase 5's own wording asks for attribution "by project/service/campaign."
**Client-level, project-level, and campaign-level** attribution are all
built:

- **Revenue** is real: `Invoice.clientId` already existed — every
  invoice was already tied to exactly one client. `Invoice.projectId`
  (optional, added in the project-level slice) additionally tags an
  invoice to one of that client's own projects. There is deliberately
  **no** `Invoice.campaignId` — this agency invoices at the
  project/retainer level, never per campaign, so a campaign-level
  revenue concept would be inventing a billing structure nobody asked
  for. Revenue attribution therefore stops at the project level.
- **Cost** is real: `Expense.clientId` (optional — `null` means a
  genuine org-wide overhead cost like software or a non-client-specific
  contractor, reported as a separate "unattributed" total, never guessed
  at or evenly split across clients), `Expense.projectId` (optional,
  project-level slice), and `Expense.campaignId` (optional, this slice)
  all work the same way, one level deeper each time.

**Service-level attribution is still not built**, and the reason is
concrete, not just "later": it would need billable line items on
invoices; `Client.services` today is just a tag list, not a billing
structure. Building that now would mean inventing a UI surface nobody
asked for yet. Client-level, project-level, and campaign-level are the
three cuts that are fully real, fully usable, and required no invented
assumptions.

### Campaign-level attribution (added this slice)

`Expense.campaignId` is an optional FK to `Campaign`, mirroring exactly
how `Expense.projectId` works one level up: a campaign-tagged expense
is only meaningful alongside a `projectId` (a campaign belongs to
exactly one project, so a campaign-tagged expense is implicitly
project- and client-tagged too), enforced in `createExpense`, not the
schema. Unlike the project/client levels, campaign-level attribution
is **cost-only** — there is no campaign-level revenue to pair it
against (see above), so this isn't a revenue/cost/profit/margin table
like the other two levels. Instead, `getCampaignProfitability(projectId)`
compares each campaign's real actual spend (summed `Expense.amountCents`
tagged to it) against `Campaign.budgetCents` — the pre-existing
manually-set estimate that was never reconciled against anything real
before this slice — reporting the difference as a variance (positive =
under budget, negative = over budget, `null` when no budget was set at
all, never treated as a $0 budget). A project-level expense tagged to
the project but not to any specific campaign is real project cost but
isn't attributable to one campaign, so it's reported as
`unassignedCostCents`, same "never guessed at or split evenly" rule as
every other level.

**UI**: `AddExpenseForm` gained an optional campaign `<select>`,
rendered only once a project has been chosen in the (already-existing)
project `<select>` and scoped to that project's own campaigns —
picking a different project resets the campaign choice, since a
campaign from the old project no longer applies. `AddInvoiceForm`
deliberately did **not** gain a campaign picker (see the no-`Invoice.
campaignId` note above). The campaign detail page
(`/clients/[id]/projects/[projectId]/campaigns/[campaignId]`) gained a
"Profitability" card (gated on `finance:read`, same pattern as the
project detail page's) showing that one campaign's budget, actual
spend, and variance.

### Project-level attribution (added this slice)

`Invoice.projectId` and `Expense.projectId` are both optional FKs to
`Project`. Both write paths (`createInvoice`, `createExpense`) validate
that a given `projectId` actually belongs to the given `clientId` (not
just the caller's organization) — a project belongs to exactly one
client, so tagging an invoice to a project that isn't really that
client's own would silently corrupt the numbers. `createExpense`
additionally rejects a `projectId` given without a `clientId` (a
project-tagged expense with no client doesn't make sense).

`getProjectProfitability(clientId)` mirrors `getClientProfitability`'s
shape one level down: for each of the client's projects, revenue (paid
invoices tagged to that project), cost (expenses tagged to that
project), profit, and margin. An invoice or expense with `projectId =
null` is real revenue/cost for the client but isn't attributable to a
specific project — it's reported as `unassignedRevenueCents` /
`unassignedCostCents`, never guessed at or split evenly across
projects.

**UI**: `AddInvoiceForm`/`AddExpenseForm` gained an optional project
`<select>` (only rendered when the client has any projects) at all four
call sites (client detail page, and the dedicated invoices/expenses
list pages). The project detail page gained a "Profitability" card
(gated on `finance:read`, same as the CEO Dashboard's table) showing
that one project's revenue/cost/profit/margin, or a message pointing
to where to tag an invoice/expense when nothing has been assigned yet.

While touching `profitability-service.ts`, a real unbounded query was
also fixed: `getClientProfitability`'s cost computation used to
`findMany` every expense in the organization into memory just to sum a
handful of numbers in JS. It now uses `groupBy`/`aggregate`, computed in
the database, matching the pattern the revenue side already used for
invoices.

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

`getCampaignProfitability(projectId)` (added this slice) is narrower —
no revenue side at all (see the scope boundary above):

- **Actual cost** = sum of `Expense.amountCents` where `campaignId`
  matches, grouped by campaign. Expenses tagged to the project but not
  a campaign are summed separately as `unassignedCostCents`.
- **Variance** = `Campaign.budgetCents` − actual cost, or `null` when
  no budget was ever set (never treated as a $0 budget).

## Entities

| Model | Change |
|---|---|
| `Expense.clientId` | Optional. `Client.expenses` back-relation added. |
| `Invoice.projectId` | Optional FK to `Project`. `Project.invoices` back-relation added. |
| `Expense.projectId` | Optional FK to `Project`, indexed. `Project.expenses` back-relation added. |
| `Expense.campaignId` | Optional FK to `Campaign`, indexed. `Campaign.expenses` back-relation added. |

## The write path (`expense-service.ts`, `invoice-service.ts`)

`createExpense` validates a positive amount and non-empty category,
and — when `clientId` is given — that the client belongs to the
caller's own organization; when `projectId` is also given, that the
project actually belongs to that `clientId` (rejecting a project given
with no client at all); when `campaignId` is also given, that the
campaign actually belongs to that `projectId` (rejecting a campaign
given with no project at all) — the same check, one level deeper.
`createInvoice` does the equivalent `projectId`-belongs-to-`clientId`
check via `assertProjectBelongsToClient`; it has no campaign-level
equivalent (see the scope boundary above — there is no
`Invoice.campaignId`).

## Permissions

`createExpense`/`createInvoice` require `finance:write` (the same
permission `finance:read` pairs with on the CEO Dashboard and project
detail page) — recording a cost or billing document is a
financial-record write, not a per-client write like `clients:write`,
so it is intentionally not client-scoped the way `clients:write` is.
`getClientProfitability`/`getProjectProfitability`/
`getCampaignProfitability` themselves do no authorization (mirrors
`calendar-service.ts`/`search-service.ts`'s pattern of taking an
already-authorized scope) — their callers already gate on
`finance:read`.

## UI

- **CEO Dashboard** (`/dashboard`): a new "Client profitability" table
  — client name (linked), revenue, cost, profit (red when negative),
  margin — sorted by profit descending, only listing clients with any
  revenue or cost so a completely untouched client doesn't clutter the
  table. A footer line reports unattributed overhead when present.
- **Client profile page**: a new "Expenses" card listing expenses
  logged against that client, with a "+ Log expense" form (category,
  amount, optional description, optional project, optional campaign
  once a project is chosen) visible only to `finance:write` holders.
  The invoice form gained the same optional project picker (no
  campaign picker — see the scope boundary above).
- **Project detail page**: a new "Profitability" card (gated on
  `finance:read`) showing that project's revenue/cost/profit/margin, or
  a pointer to where to tag revenue/cost when nothing has been assigned.
- **Campaign detail page**: a new "Profitability" card (gated on
  `finance:read`) showing that campaign's budget, actual spend, and
  variance.

## Failure modes

- **Non-positive amount or empty category**: rejected.
- **Client from a different organization**: rejected — same
  cross-tenant check pattern as every other module.
- **A campaign given without a project, or a campaign belonging to a
  different project than the one given**: rejected — same pattern as
  the pre-existing project-without-client / wrong-client-project checks.
- **A campaign with no expenses tagged to it**: `actualCostCents` is 0,
  `varianceCents` equals the full budget (or `null` if no budget was
  set) — never a fabricated number.
- **A client with no invoices or expenses at all**: `revenueCents` and
  `costCents` both 0, `marginPct` is `null` (not `0%`) — and it's
  excluded from the dashboard table entirely rather than shown as a
  confusing all-zero row.

## Acceptance tests

- `apps/web/src/lib/services/profitability.integration.test.ts` — 17
  tests against real Postgres: `createExpense` rejects invalid input
  and a cross-organization client; it creates both a client-attributed
  expense and a client-less (overhead) one; `getClientProfitability`
  counts revenue only from `PAID` invoices (an unpaid invoice for the
  same client is confirmed excluded), correctly separates attributed
  cost from `unattributedCostCents`, and correctly isolates each
  client's cost from another client's expenses; `createExpense`'s
  project validation rejects a `projectId` with no `clientId` and one
  belonging to a different client, and accepts one that belongs to the
  given client; `getProjectProfitability` breaks down revenue/cost/
  profit by project (confirming an unpaid invoice tagged to a project
  doesn't count as that project's revenue), correctly buckets
  untagged invoices/expenses as unassigned, and stays scoped to the
  given client's own projects. Added this slice: `createExpense`'s
  campaign validation rejects a `campaignId` with no `projectId` and
  one belonging to a different project, and accepts one that belongs
  to the given project; `getCampaignProfitability` computes budget vs.
  actual cost per campaign (confirming a campaign with no budget set
  reports a `null` variance, not a $0-budget variance), correctly
  buckets untagged project-level expenses as unassigned, rejects a
  campaign-tagged expense whose campaign doesn't belong to the given
  project (including one belonging to a different organization
  entirely), and stays scoped to the given project's own campaigns.
- `apps/web/src/lib/services/invoice.integration.test.ts` — gained
  tests confirming `createInvoice` accepts a `projectId` that belongs
  to the client and rejects one that belongs to a different client in
  the same organization.
- `apps/web/src/app/api/invoices/route.contract.test.ts` and
  `apps/web/src/app/api/expenses/route.contract.test.ts` — gained
  tests confirming the routes round-trip a `projectId` through to the
  persisted row, and surface the service's project-validation errors
  as 400s. `apps/web/src/app/api/expenses/route.contract.test.ts`
  gained a test this slice confirming the route round-trips a
  `campaignId` through to the persisted row, and rejects a campaign
  belonging to a different project than the one given.
- Manual smoke test performed for the client-level slice against the
  real running server: confirmed the CEO Dashboard showed the seeded
  client's real paid-invoice revenue and the seed script's overhead
  expenses correctly reported as unattributed, logged a new expense
  against that client via the API, confirmed the dashboard's
  cost/profit/margin figures updated immediately, confirmed the expense
  appeared on the client profile page's new Expenses card, and
  confirmed an unauthenticated request to create an expense was
  rejected with 401.
- Manual smoke test performed for the project-level slice against the
  real running production server (`npm run start`), logged in as the
  seeded owner: created a `DRAFT` invoice and an expense against a real
  seeded project via the live API, cross-checked both rows directly in
  Postgres via `psql`; confirmed the project detail page's new
  Profitability card correctly showed $0 revenue (the invoice was still
  `DRAFT`) and $300 cost via a headless-browser check; sent and marked
  the invoice paid through the real invoice-actions API, re-checked the
  same page and confirmed revenue, profit, and margin all updated
  correctly ($2,500 / $2,200 / 88%); confirmed the invoice/expense forms
  on the client detail page rendered a real project `<select>`
  populated from the database. All inserted rows deleted afterward and
  the dev database's row counts confirmed back at their pre-test values.
- Manual smoke test performed for the campaign-level slice against the
  real running production server (`npm run start`), logged in as the
  seeded owner: created a real expense tagged to the seed data's real
  "FastCharge 65W Launch" campaign ($420 in "Smoke Test Ad Spend") via
  the live API, cross-checked it directly in Postgres via `psql`;
  confirmed the API rejects a campaign tagged against a project it
  doesn't belong to (400, "Project not found for this client" — the
  project-level check fires first, before the campaign check is ever
  reached); drove a real headless Chromium browser (no mocked
  rendering) to the campaign detail page and confirmed the new
  Profitability card showed the real numbers — Budget $1,500 (the
  seeded `Campaign.budgetCents`), Actual spend $420, Variance $1,080 —
  and to the client detail page, opened the real "+ Log expense" form,
  selected the real "FastCharge Launch" project from its `<select>`,
  and confirmed a second `<select>` appeared scoped to exactly that
  project's one campaign ("FastCharge 65W Launch"), with no layout
  overflow in a full-page screenshot. The inserted expense row and its
  audit event were deleted afterward and the dev database's expense
  count confirmed back at its pre-test value (2).
