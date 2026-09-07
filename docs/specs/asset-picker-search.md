# Module: Search-as-You-Type Asset Picker (Phase 7 — Scale Hardening)

Status: **Implemented (representative slice)**. Closes the last
remaining ranked item from the Phase 7 audit documented in
`docs/specs/dashboard-aggregates.md`'s "Scope boundary" section —
"asset-picker dropdowns," explicitly flagged there as needing a real
search-as-you-type redesign rather than a one-line pagination change
(unlike every other item that slice's audit found).

## The problem

The "Add new version" form on a creative's detail page
(`.../creatives/[creativeId]/page.tsx:103`, prior to this slice) loaded
**every** asset a client has ever had into a plain `<select>` dropdown,
just so a user could pick one to link to a new creative version. Unlike
a table or list, a `<select>` with hundreds of options is also a real
UX problem, not just a performance one — scrolling through an
alphabetically-unsorted (actually date-sorted, but still flat) list of
file names to find one specific file doesn't scale the way pagination
does for a table.

## The fix

- **`searchClientAssets()`** (`apps/web/src/lib/services/asset-service.ts`) —
  a real, permission-checked (`clients:read`, via `requirePermission`,
  same as every other client-scoped query in this codebase) search:
  `filename: { contains: q, mode: "insensitive" }`, bounded to 10
  results, `AVAILABLE` assets only. A blank query returns the 10 most
  recently uploaded files — a real, useful default when a user opens
  the picker before typing anything, not an empty result or an error.
- **`GET /api/clients/[id]/assets/search?q=...`** — thin route wrapper,
  401/403/200 same as every other route-contract-tested endpoint in
  this codebase.
- **`AssetPicker.tsx`** — a real search-as-you-type client component:
  debounced (250ms) fetch as the user types, a dropdown of up to 10
  matches, click-to-select, a "Clear" affordance to search again.
  Replaces the plain `<select>` in `AddVersionForm.tsx`.
- **The page's unbounded `prisma.asset.findMany` is gone entirely** —
  not bounded, *removed*. The picker fetches on demand instead of the
  page pre-loading a list for it, so there's no `take: N` preview
  query to maintain here at all — a stronger fix than the "preview +
  View all" pattern used everywhere else in Phase 7's scale hardening
  work, appropriate because a *picker* (choose exactly one thing) has
  a genuinely different real use case than a *list* (browse recent
  history).

## Scope boundary — stated explicitly

**Representative, not exhaustive.** This is the one asset-picker
dropdown in the app; the Phase 7 audit's original citation for this
item didn't enumerate every instance, and a broader sweep for other
unbounded `<select>`-style pickers (e.g. the membership dropdowns used
elsewhere for task/content assignment, which are bounded by
organization member count rather than content history and were
explicitly not flagged as a concern in earlier slices) is real,
separate follow-up work if one is found to actually need it — not
claimed as done here.

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- New route-contract test suite,
  `apps/web/src/app/api/clients/[id]/assets/search/route.contract.test.ts`
  (5 tests against real Postgres): 401 unauthenticated, 403 for a
  DESIGNER lacking `clients:read` on the client, a real filename-`contains`
  match scoped to the client with a `REJECTED`-status asset correctly
  excluded, a blank query returning the real most-recent set, and
  cross-client isolation (a matching filename belonging to a different
  client never leaks into the result).
- Full `apps/web` vitest suite: 182/182 passing across 31 files (177
  before this slice + 5 new).
- `npm run build --workspace=@cedar/web`: succeeds; the creative detail
  page's bundle grows (2.06 kB → 2.51 kB) reflecting the new picker
  component, and the new search route compiles.
- **Live smoke test against the real running server and the seeded dev
  database, at both the HTTP and real-browser level**: inserted two
  real assets for the seeded demo client via direct SQL
  (`hero-banner-final.png`, `brand-guidelines.pdf`). Confirmed via
  direct HTTP calls that `?q=hero` returns exactly the one matching
  asset and a blank query returns both, most-recent-first. Then, via a
  real Playwright browser session (not just the API), logged in as the
  seeded owner, navigated to a real creative's detail page, typed
  "hero" into the actual picker input, confirmed the rendered dropdown
  showed exactly `hero-banner-final.png`, clicked it, and confirmed the
  picker's UI updated to show the selected filename — proving the
  debounced fetch, the dropdown rendering, and the click-to-select flow
  all work end-to-end through a real browser. Both inserted test assets
  were deleted afterward, restoring the dev database's original state.

## Acceptance

- `apps/web/src/lib/services/asset-service.ts` — `searchClientAssets`.
- `apps/web/src/app/api/clients/[id]/assets/search/route.ts` — search
  endpoint.
- `apps/web/src/app/(app)/clients/[id]/projects/[projectId]/campaigns/[campaignId]/creatives/[creativeId]/AssetPicker.tsx` —
  new component.
- `AddVersionForm.tsx` and `page.tsx` (same directory) — wired to use
  the picker; the unbounded `findMany` removed.
- `apps/web/src/app/api/clients/[id]/assets/search/route.contract.test.ts` —
  5 tests.
