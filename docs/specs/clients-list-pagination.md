# Module: Clients List Pagination (Phase 7 — Scale Hardening)

Status: **Implemented**. Closes the third-ranked remaining item from
the Phase 7 audit documented in `docs/specs/dashboard-aggregates.md`'s
"Scope boundary" section.

## The problem

`apps/web/src/app/(app)/clients/page.tsx` fetched **every client the
signed-in actor can read** on every page load — unbounded across the
whole organization — and, for each one, fully included its `projects`
relation just to display `.length`, and its whole `brandProfile`
record just to check truthiness. This scales differently from the
history-based items fixed in the two prior slices
(`docs/specs/client-relations-pagination.md`,
`docs/specs/opportunity-engine-scaling.md`): it grows with
organization-wide *client count*, not with any one client's
transactional history — but the Bible's own stated scale target is 500
clients per organization, so it's a real, bounded-but-large number
this page would eventually have to render (and fully data-transfer) in
one request.

## The fix

- **Pagination**: `PAGE_SIZE = 24`, offset pagination via a `?page=`
  URL search param — the exact same shape and shared `Pagination`
  component (`apps/web/src/components/Pagination.tsx`) used by the
  prior client-relations-pagination slice. `prisma.client.findMany`
  now takes `skip`/`take`; `prisma.client.count` (same `where`) runs
  alongside it for the total.
- **`select` instead of `include`**: `projects: true` (full array) →
  `_count: { select: { projects: true } }` (just the number displayed);
  `brandProfile: true` (the full record, including its JSON blob
  columns) → `brandProfile: { select: { id: true } }` (just enough to
  render the "Brand DNA set" / "No Brand DNA yet" truthiness check).
- The Section 38 scoped-collaborator filter (`getReadableClientIds`)
  is unchanged — it's still applied inside the same `where` clause, so
  pagination never widens what a scoped collaborator can see; it only
  bounds how many of their *readable* clients render in one request.

## What did NOT change

- Card markup, grid layout, status-badge styling, and every link's
  `href` are byte-identical to before — this is a pure data-fetching
  change. The existing Playwright E2E specs that navigate through
  `/clients` and click a client card by name
  (`approval-workflow.spec.ts`, `client-portal.spec.ts`,
  `content-calendar.spec.ts`) need no changes, since the seeded demo
  data has one client and always fits on page 1.
- No search or filter UI was added — this slice is scoped to bounding
  the query, not adding new UX for finding a specific client among
  hundreds (a real, separately-scoped follow-up if 24-per-page browsing
  turns out to be the wrong UX at the Bible's 500-client target).

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- Full `apps/web` vitest suite: 158/158 passing, unchanged (no
  service-layer logic was extracted for this page — the pagination
  math is the same shape already proven correct by
  `client-relations-service.integration.test.ts`'s 9 tests in the
  prior slice, so a redundant duplicate test wasn't added; verification
  here is the live smoke test below, consistent with how the CEO
  Dashboard slice was verified).
- `npm run build --workspace=@cedar/web`: succeeds.
- **Live smoke test against the real running server and the seeded dev
  database, with a direct-SQL cross-check**: inserted 30 temporary
  clients via direct SQL (31 total for the organization, exceeding one
  page at `PAGE_SIZE=24`), logged in as the seeded owner, and confirmed
  via real HTTP responses: page 1 renders exactly 24 unique client
  links with no "next page" link rendered incorrectly, page 2 renders
  exactly the remaining 7 with a correct "back to page 1" link and no
  spurious "page 3" link. `select count(*) from clients` against
  Postgres directly returned 31, matching 24 + 7 exactly. All 30
  inserted test clients were deleted afterward, restoring the dev
  database's original single-client state.

## Scope boundary — what's still open

Remaining ranked items from the Phase 7 audit
(`docs/specs/dashboard-aggregates.md`): the content calendar's
per-client lists, the Client Portal's external-facing lists, the
shoots page, and asset-picker dropdowns.

## Acceptance

- `apps/web/src/app/(app)/clients/page.tsx` — pagination, `_count` and
  `select`-scoped `brandProfile`.
