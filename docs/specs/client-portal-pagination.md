# Module: Client Portal Pagination (Phase 7 — Scale Hardening)

Status: **Implemented**. Closes the fifth-ranked remaining item from
the Phase 7 audit documented in `docs/specs/dashboard-aggregates.md`'s
"Scope boundary" section — the audit's own ranking called this one out
as having "real customer-visible latency risk," since it's the one
unbounded surface external portal clients (not internal staff) hit
directly.

## The problem

`apps/web/src/app/portal/[clientId]/page.tsx` (Bible Section 15.2) is
the curated view an external client contact sees. It fetched **every**
pending-or-approved creative, **every** invoice, and **every**
`AVAILABLE` asset for the client on every load — unbounded across the
entire client relationship's lifetime.

## The fix

Same "bounded preview + View all page" pattern as the internal client
detail page (`docs/specs/client-relations-pagination.md`):

- **Approved history**, **Invoices**, and **Files** each get a
  `PREVIEW_LIMIT = 10` bounded query plus a separate `count()`, and a
  "View all (N)" link appears only when the count exceeds what's
  previewed. Three new pages —
  `/portal/[clientId]/approved`, `/portal/[clientId]/invoices`,
  `/portal/[clientId]/files` — provide real offset pagination
  (`PAGE_SIZE = 20`) via the same shared `Pagination` component used
  throughout this Phase 7 work, each independently re-checking
  `clients:read` before rendering (never trusting the parent page's
  auth check).
- **"Pending your review" is handled differently, deliberately**: it's
  a live work queue a portal client is expected to act on and clear to
  zero, not a growing historical archive. There's no "view all" page
  for it — paging through a backlog of undecided approvals isn't a
  real use case, and if it ever needed one, that would be a sign of a
  process problem, not a display problem. Instead it gets a defensive
  `take: PENDING_CAP` (50) so a pathological backlog still can't make
  the query unbounded, without building UI for a scenario that
  shouldn't happen.
- The combined `creatives.findMany` + client-side
  `.filter((c) => c.status === ...)` split (pending vs. approved) was
  replaced with two separate `findMany` calls, one per status, each
  with its own `take` — cleaner than fetching a mixed unbounded set and
  splitting it in Node, and it's what made independent bounds for the
  two possible.

## What did NOT change

- Every query is still scoped to the one `clientId` in the URL — no
  change to Section 15.2's core isolation guarantee. The three new
  pages repeat the exact same `client.findFirst({ where: { id,
  organizationId } })` + `isAuthorized("clients:read")` check as the
  parent page, rather than trusting a session or a referrer.
- `PortalDecideForm`'s behavior, the approval decision flow, and every
  other action on this page are untouched.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- Full `apps/web` vitest suite: 158/158 passing, unchanged (no
  service-layer logic changed — this is page-level query bounding,
  same shape as the three prior pagination slices whose pagination math
  is already covered by `client-relations-service.integration.test.ts`).
- `npm run build --workspace=@cedar/web`: succeeds; all 3 new routes
  compile.
- **Live smoke test against the real running server and the seeded dev
  database**: inserted 15 approved creatives, 15 invoices, and 15
  `AVAILABLE` assets for the seeded demo client via direct SQL.
  Confirmed via real HTTP responses that the main portal page's three
  "View all" links appeared with the correct total counts (15, 17 —
  15 inserted + 2 pre-existing — and 15 respectively) only once each
  count exceeded the 10-item preview. Then pushed invoices further (22
  total, crossing the `PAGE_SIZE=20` boundary) and confirmed the new
  `/portal/[clientId]/invoices` page split exactly 20/2 across pages 1
  and 2 with no spurious extra-page link. All inserted test rows (1
  campaign, 15 creatives, 20 invoices, 15 assets) were deleted
  afterward, restoring the dev database's original state (2 invoices
  for that client, zero approved creatives, zero assets).

## Scope boundary — what's still open

The last remaining ranked items from the Phase 7 audit: the shoots
page and asset-picker dropdowns (including the New Content Item form's
selects noted in `docs/specs/content-calendar-pagination.md`).

## Acceptance

- `apps/web/src/app/portal/[clientId]/page.tsx` — bounded previews,
  `count()`-driven "View all" links, split pending/approved queries.
- `apps/web/src/app/portal/[clientId]/approved/page.tsx`,
  `invoices/page.tsx`, `files/page.tsx` — 3 new paginated pages.
