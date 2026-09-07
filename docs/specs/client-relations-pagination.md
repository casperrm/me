# Module: Client Detail Page Pagination (Phase 7 — Scale Hardening)

Status: **Implemented**. Closes the highest-ranked remaining item from
the Phase 7 audit documented in `docs/specs/dashboard-aggregates.md`'s
"Scope boundary" section.

## The problem

`apps/web/src/app/(app)/clients/[id]/page.tsx`'s single
`prisma.client.findFirst` call nested **six unbounded relations** in
its `include`: `projects` (itself nesting fully unbounded `campaigns`
and `tasks`, fetched only to display their `.length`), `invoices`,
`expenses`, `notes`, `timelineEvents`, and `assets`. Every one of these
grows for as long as the client relationship exists — a multi-year
client's profile page would eventually load its entire transactional
and creative history in one request, on every page view.

## The fix

### 1. A real pagination service

`apps/web/src/lib/services/client-relations-service.ts` exports one
paginated accessor per relation (`getPaginatedProjects`,
`getPaginatedInvoices`, `getPaginatedExpenses`, `getPaginatedNotes`,
`getPaginatedTimelineEvents`, `getPaginatedAssets`), all built on a
shared `paginate()` helper: offset pagination, `PAGE_SIZE = 20`, each
call runs a bounded `findMany({ skip, take })` alongside a `count()`
in parallel and returns `{ items, totalCount, page, totalPages }`.
Invalid page numbers (`0`, negative, `NaN`) clamp to page 1 rather than
producing a negative `skip`.

### 2. Six new "View all" pages

Each relation now has a dedicated route reusing the existing form/action
components (`AddInvoiceForm`, `AddExpenseForm`, `AssetUploadForm`,
`NewProjectForm`, etc.) so write actions work identically to before:

- `/clients/[id]/invoices`
- `/clients/[id]/expenses`
- `/clients/[id]/notes`
- `/clients/[id]/timeline`
- `/clients/[id]/files` (assets)
- `/clients/[id]/projects` (a new sibling list page next to the
  existing `/clients/[id]/projects/[projectId]` detail route — Next.js
  allows both to coexist)

Each renders a shared `Pagination` component
(`apps/web/src/components/Pagination.tsx`) — "Page X of Y (N total)"
plus Newer/Older links that only render as clickable when a
previous/next page actually exists, otherwise a disabled span. No
client JavaScript, no state — page number lives entirely in the
`?page=` URL search param, so links are shareable and back/forward
navigation works for free.

### 3. The overview page: bounded preview + "View all" links

The main client detail page keeps its single-request overview, but now
bounds every relation with `take: PREVIEW_LIMIT` (10) and adds a
`_count` alongside each relation so it can render a real total without
fetching the rest:

```ts
const client = await prisma.client.findFirst({
  where: { id, organizationId: actor.organizationId },
  include: {
    projects: { orderBy: { createdAt: "desc" }, take: PREVIEW_LIMIT, include: { _count: { select: { campaigns: true, tasks: true } } } },
    invoices: { orderBy: { issuedAt: "desc" }, take: PREVIEW_LIMIT },
    // ...same shape for expenses, notes, timelineEvents, assets
    _count: { select: { projects: true, invoices: true, expenses: true, notes: true, timelineEvents: true, assets: true } },
  },
});
```

A "View all (N)" link appears in each Card's header only when
`client._count.X > client.X.length` — i.e., only when there's actually
more to see. With 10 or fewer records in a category, the page looks
and behaves exactly as it did before this slice.

### A second real fix bundled in: campaign/task counts

The old query fetched every `Campaign` and `Task` row for every
project just to display `p.campaigns.length` / `p.tasks.length` — full
rows transferred over the wire to compute two integers. Replaced with
`_count: { select: { campaigns: true, tasks: true } }` on both the
overview page and the new projects list page: same numbers displayed,
zero row transfer, and Postgres computes the counts directly.

## What did NOT change

- **Notes have no create form anywhere in this app** — the existing
  main page only ever *displayed* notes read-only, and the new
  `/clients/[id]/notes` page preserves that (no `AddNoteForm` exists
  to reuse, and building one was out of scope for a pagination slice).
- **Write actions are unchanged.** `InvoiceActions`, `AddExpenseForm`,
  `AssetUploadForm`, `NewProjectForm`, delete-asset, etc. all work
  identically on both the overview page and the new list pages — no
  new permission checks were introduced beyond what the overview page
  already enforced (`clients:read` to view, `clients:write`/
  `finance:write` to act).
- **Sort order is unchanged** for every relation except `projects`,
  which previously had no explicit `orderBy` (relying on Prisma's
  default, effectively insertion order) and now explicitly orders
  `createdAt: "desc"` — the same order the preview and the new list
  page both use, so the two views are consistent with each other,
  which they weren't guaranteed to be before.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- New integration test suite,
  `client-relations-service.integration.test.ts` (9 tests against real
  Postgres): proves page-1/page-2 boundaries with no overlap (25 real
  invoice rows, `PAGE_SIZE=20` split), newest-first ordering, invalid
  page numbers clamping to 1, per-client scoping (a second client's
  invoices never leak into the first's page), `_count` returning real
  campaign/task counts without over-fetching, and correct shape/scoping
  for expenses, notes, timeline events, and assets (including the
  `uploadedBy` relation on assets).
- Full `apps/web` vitest suite: 157/157 passing across 27 files (148
  before this slice + 9 new).
- `npm run build --workspace=@cedar/web`: succeeds; all 6 new routes
  (`/clients/[id]/invoices`, `/expenses`, `/notes`, `/timeline`,
  `/files`, `/projects`) compile as dynamic routes.
- **Live smoke test against the real running server and the seeded dev
  database**, proving pagination is real rather than merely present:
  inserted 25 extra invoice rows for the seeded demo client via direct
  SQL (17 first, confirming the client detail page's "View all (17)"
  link appears correctly once a relation exceeds `PREVIEW_LIMIT`; then
  10 more, for 27 total, to exceed one page at `PAGE_SIZE=20`) and
  confirmed via the real HTTP responses: page 1 renders exactly 20
  unique invoice ids, page 2 renders exactly the remaining 7 with zero
  overlap with page 1, page 1 has both Newer and Older navigation while
  correctly-disabled at the boundary (no `?page=3` link exists on page
  2, since 2 is the last page; page 2 correctly links back to page 1).
  All 25 inserted test invoices were deleted afterward, restoring the
  dev database's original 2 invoices for that client — no seeded demo
  data was permanently altered.

## Scope boundary — what's still open

The Phase 7 audit's remaining ranked items (`docs/specs/dashboard-aggregates.md`)
that this slice did **not** touch: the Opportunity Engine's
full-organization creative scan, the clients list page (unbounded
across the whole organization, not per-client), the content calendar's
per-client lists, the Client Portal's external-facing lists, the
shoots page, and the asset-picker dropdowns used when attaching a file
to a creative or campaign. Each is real, separately-scoped follow-up
work — not silently resolved by this slice just because it shares a
general theme.

## Acceptance

- `apps/web/src/lib/services/client-relations-service.ts` — new
  pagination service, 6 accessors.
- `apps/web/src/components/Pagination.tsx` — new shared pagination UI.
- `apps/web/src/app/(app)/clients/[id]/invoices/page.tsx`,
  `expenses/page.tsx`, `notes/page.tsx`, `timeline/page.tsx`,
  `files/page.tsx`, `projects/page.tsx` — 6 new "View all" pages.
- `apps/web/src/app/(app)/clients/[id]/page.tsx` — bounded preview
  queries, `_count`-based totals, "View all" links, `_count`-based
  campaign/task counts on the Projects card.
- `apps/web/src/lib/services/client-relations-service.integration.test.ts`
  — 9 tests against real Postgres.
