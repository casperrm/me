# Module: Content Calendar Pagination (Phase 7 — Scale Hardening)

Status: **Implemented**. Closes the fourth-ranked remaining item from
the Phase 7 audit documented in `docs/specs/dashboard-aggregates.md`'s
"Scope boundary" section.

## The problem

`apps/web/src/app/(app)/clients/[id]/content/page.tsx` fetched
**every** content calendar item ever created for a client on every
page load — no bound, growing indefinitely as a client's scheduling
history accumulates across months and years of ongoing content
production.

## The fix

Same shape as the two prior pagination slices
(`docs/specs/client-relations-pagination.md`,
`docs/specs/clients-list-pagination.md`): `PAGE_SIZE = 20`, offset
pagination via a `?page=` URL search param, the same shared
`Pagination` component. `prisma.contentCalendarItem.findMany` now
takes `skip`/`take`; `prisma.contentCalendarItem.count` (same `where`)
runs alongside it in the same `Promise.all` for the total.

## What deliberately did NOT change

The page's three dropdown-source queries — `campaigns`, `creatives`,
and (when `canWrite`) `members` used to populate the "New Content Item"
form's selects — are left unbounded. This is not an oversight: they're
the exact "asset-picker dropdowns" item from the Phase 7 audit
(`docs/specs/dashboard-aggregates.md`), ranked as its own separate,
lower-priority follow-up because fixing it properly means a
search-as-you-type picker, not a one-line pagination change like the
main table got. Folding it into this slice would have been scope creep
past what this slice actually verified.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- Full `apps/web` vitest suite: 158/158 passing, unchanged (the
  pagination math is the same already-tested shape from
  `client-relations-service.integration.test.ts`; the existing
  `content-calendar.integration.test.ts` service-level tests are
  untouched since this is a page-level query change, not a service
  change).
- `npm run build --workspace=@cedar/web`: succeeds.
- **Live smoke test against the real running server and the seeded dev
  database**: inserted 25 temporary content calendar items for the
  seeded demo client via direct SQL (exceeding one page at
  `PAGE_SIZE=20`), logged in as the seeded owner, and confirmed via
  real HTTP responses: page 1 renders exactly 20 of the inserted items,
  page 2 renders exactly the remaining 5, with no spurious "page 3"
  link on either page. All 25 inserted test rows were deleted
  afterward, restoring the dev database's original state (zero content
  calendar items for that client).
- The existing Content Calendar E2E test
  (`tests/e2e/content-calendar.spec.ts`, Section 9's BRIEF → DRAFT →
  INTERNAL_REVIEW transition test) needs no changes: it creates one
  item against a freshly reset database, well under `PAGE_SIZE`, so
  pagination is a no-op for that flow.

## Scope boundary — what's still open

Remaining ranked items from the Phase 7 audit: the Client Portal's
external-facing lists, the shoots page, and the asset-picker dropdowns
(including this page's own campaign/creative/member selects, noted
above).

## Acceptance

- `apps/web/src/app/(app)/clients/[id]/content/page.tsx` —
  pagination added to the main content items table.
