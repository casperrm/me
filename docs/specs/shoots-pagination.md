# Module: Shoots Page Pagination (Phase 7 — Scale Hardening)

Status: **Implemented**. Closes the sixth-ranked remaining item from
the Phase 7 audit documented in `docs/specs/dashboard-aggregates.md`'s
"Scope boundary" section.

## The problem

`apps/web/src/app/(app)/clients/[id]/shoots/page.tsx` fetched every
production shoot ever scheduled for a client, unbounded — the same
shape as the content calendar item fixed in
`docs/specs/content-calendar-pagination.md`.

## The fix

Identical shape: `PAGE_SIZE = 20`, offset pagination via `?page=`, the
same shared `Pagination` component, `prisma.shoot.count` alongside
`prisma.shoot.findMany`. The New Shoot form's project dropdown is left
unbounded — it's scoped by project count per client, not production
history, so it isn't the concern this bounds (same reasoning as the
content calendar's campaign/creative dropdowns).

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- Full `apps/web` vitest suite: 158/158 passing, unchanged.
- `npm run build --workspace=@cedar/web`: succeeds.
- **Live smoke test against the real running server and the seeded dev
  database**: inserted 24 temporary shoots for the seeded demo client
  via direct SQL (exceeding one page at `PAGE_SIZE=20`), logged in as
  the seeded owner, and confirmed via real HTTP responses: page 1
  renders exactly 20 of the inserted shoots, page 2 renders exactly the
  remaining 4, with no spurious "page 3" link on either. All 24
  inserted test rows were deleted afterward, restoring the dev
  database's original state (zero shoots for that client).

## Scope boundary — what's still open

The last remaining ranked item from the Phase 7 audit: asset-picker
dropdowns (a real search-as-you-type redesign, not a pagination
change — see `docs/specs/content-calendar-pagination.md`'s "What
deliberately did NOT change" section for why it's scoped separately).

## Acceptance

- `apps/web/src/app/(app)/clients/[id]/shoots/page.tsx` — pagination
  added to the shoots list.
