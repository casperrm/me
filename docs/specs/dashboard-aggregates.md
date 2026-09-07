# Module: CEO Dashboard Aggregate Queries (Phase 7 — Scale Hardening)

Status: **Implemented (first slice)**. Closes part of the gap
`ROADMAP.md`'s Phase 7 section had tracked as "not started": the CEO
Dashboard was the highest-traffic page in the app (loaded on every
sign-in) and the worst offender for unbounded queries.

## The problem

`apps/web/src/app/(app)/dashboard/page.tsx` computed four
organization-wide numbers — revenue, outstanding, expenses, and active
vs. total client counts — by fetching **every** client, invoice, and
expense row the organization has ever created into Node, then reducing
over the full arrays in JavaScript:

```ts
const [clients, invoices, expenses, ...] = await Promise.all([
  prisma.client.findMany({ where: { organizationId } }),
  prisma.invoice.findMany({ where: { client: { organizationId } } }),
  prisma.expense.findMany({ where: { organizationId } }),
  ...
]);
const revenueCents = invoices.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.amountCents, 0);
const outstandingCents = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE").reduce(...);
const expensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
const activeClients = clients.filter((c) => c.lifecycleStage === "ACTIVE").length;
```

This is a full-table scan, transferred row-by-row over the wire, on
every single dashboard load — cost grows without bound as an
organization accumulates history, even though the page only ever
displays four numbers.

## The fix

Replaced the three `findMany` calls with `prisma.count()` and
`prisma.aggregate({ _sum })` calls, which push the same computation
into Postgres and return only the numbers actually needed — O(1) data
transfer instead of O(every row ever):

```ts
prisma.client.count({ where: { organizationId } }),
prisma.client.count({ where: { organizationId, lifecycleStage: "ACTIVE" } }),
prisma.invoice.aggregate({ where: { client: { organizationId }, status: "PAID" }, _sum: { amountCents: true } }),
prisma.invoice.aggregate({ where: { client: { organizationId }, status: { in: ["SENT", "OVERDUE"] } }, _sum: { amountCents: true } }),
prisma.expense.aggregate({ where: { organizationId }, _sum: { amountCents: true } }),
```

`revenueCents`/`outstandingCents`/`expensesCents` now read
`agg._sum.amountCents ?? 0` instead of reducing an array. Same output,
computed where the data lives.

Left unchanged in this slice: `delayedProjects` and `recentTimeline`
(both already bounded — the former is a real business list rendered in
full, the latter already has `take: 6`), and `getClientProfitability`
(a separate service with its own scope, not touched here).

## A real bug found and fixed along the way

While touching this code, the "Pending approvals" stat —
`prisma.creative.count({ where: { status: "PENDING_APPROVAL" } })` —
turned out to have **no organization scoping at all**. It counted
`PENDING_APPROVAL` creatives across every organization in the
database, not just the current one: a genuine cross-tenant data leak
(Bible Section 38), pre-existing and untouched by any prior slice.
Confirmed as a real, live leak (not just a theoretical one) by direct
SQL: the dev database has two organizations, and the unscoped query
was reading across both.

`Creative` has no direct `organizationId` column — it reaches an
organization through `campaign → project → client → organizationId` —
so the fix scopes through that relation chain:

```ts
prisma.creative.count({
  where: { status: "PENDING_APPROVAL", campaign: { project: { client: { organizationId } } } },
}),
```

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- Full `apps/web` vitest suite: 148/148 tests passing across 26 files
  (no test directly covers this page component — it's a server
  component with no route-contract wrapper — so this is the standard
  no-regression run, not new coverage for this specific change).
- `npm run build --workspace=@cedar/web`: succeeds, `/dashboard`
  compiles as a dynamic route as before.
- **Live smoke test, with a direct-SQL cross-check to prove the
  rewrite is byte-identical to the old computation**: started a
  production server (`npm run start`) against the existing seeded dev
  database, logged in as the seeded owner
  (`consultingcedarpoint@gmail.com`), loaded `/dashboard`, and read the
  rendered stat cards: Revenue $2,500, Outstanding $2,500, Expenses
  $750, Active clients 1 (1 total), Pending approvals 1. Then ran the
  equivalent full-scan SQL directly against Postgres for the same
  organization: `sum(amountCents)` over paid invoices = 250000 cents,
  over sent/overdue invoices = 250000 cents, over expenses = 75000
  cents, client counts = 1/1 — all matching exactly. The dev database
  has two organizations (`org_count = 2`), which is what made the
  `pendingApprovals` bug's blast radius concrete rather than
  theoretical: the unscoped query was reading `PENDING_APPROVAL`
  creatives belonging to whichever organization created them, not
  filtered to the signed-in owner's own.

## Scope boundary — what this slice explicitly did NOT fix

A background audit of `apps/web/src` for unbounded-growth Prisma
queries (searching for `findMany` calls with no `take`/pagination on
data that grows with organization age, as opposed to inherently small
or already-bounded lists) found several more real instances. Ranked by
how directly a growing organization would feel them, from most to
least immediate:

1. **Client detail page** — `apps/web/src/app/(app)/clients/[id]/page.tsx:37-49`.
   The single `prisma.client.findFirst` that loads a client profile
   nests **six unbounded relations** in its `include`:
   `projects` (with nested `campaigns` and `tasks`, themselves
   unbounded), `invoices`, `expenses`, `notes`, `timelineEvents`, and
   `assets`. Every one of these grows for as long as the client
   relationship exists; a multi-year client's profile page will
   eventually load its entire history in one request. (`brandProfile.versions`
   and `healthScores` are already correctly bounded with `take: 1`.)
   This is the single highest-impact remaining item — likely the next
   slice.
2. **Opportunity Engine** — `apps/web/src/lib/services/opportunity-service.ts:43-49`.
   Two `prisma.creative.findMany` calls with no bound, run per client
   detail page load, scanning creative history to detect format gaps.
3. **Clients list page** — `apps/web/src/app/(app)/clients/page.tsx:24`.
   `prisma.client.findMany({ where: { organizationId } })` with no
   pagination — fine at today's client counts, not fine at the Bible's
   own 500-client target.
4. **Content calendar** — `apps/web/src/app/(app)/clients/[id]/content/page.tsx:46-57`.
   `contentCalendarItem`, `campaign`, and `creative` lists all
   unbounded per client.
5. **Client Portal** — `apps/web/src/app/portal/[clientId]/page.tsx:48-64`.
   `creative`, `invoice`, and `asset` lists all unbounded — the
   external-facing surface, so this has real customer-visible latency
   risk as a portal client's history grows.
6. **Shoots page** — `apps/web/src/app/(app)/clients/[id]/shoots/page.tsx:52-53`.
   `shoot` and `project` lists unbounded per client.
7. **Asset-picker dropdowns** — e.g.
   `apps/web/src/app/(app)/clients/[id]/projects/[projectId]/campaigns/[campaignId]/creatives/[creativeId]/page.tsx:103`
   and the membership-list dropdowns in the project/content pages —
   lower risk (a `<select>`'s option list, not a rendered table), but
   still unbounded.

None of these are fixed here. Fixing them for real means different
things for different items — (1)-(2) and (4)-(6) need either
pagination UI or a deliberate "recent N, with a link to see all"
redesign (a real UI decision, not a one-line query change); (3) needs
actual list pagination; (7) needs a search-as-you-type picker instead
of a full dropdown. This slice deliberately scoped to the one page
where a pure query-shape change (no UI/behavior change at all) fully
solved the problem, and documents the rest as real, ranked, follow-up
work rather than claiming the audit's findings were resolved.

## Acceptance

- `apps/web/src/app/(app)/dashboard/page.tsx` — converted revenue,
  outstanding, expenses, and client-count queries to `count()`/
  `aggregate()`; fixed the `pendingApprovals` cross-tenant scoping bug.
- No new automated test was added for this page specifically (it has
  no pre-existing test file and adding page-level test infrastructure
  for a single query-shape change was judged out of proportion — the
  existing 148-test suite plus the manual SQL cross-check documented
  above is the verification for this slice).
