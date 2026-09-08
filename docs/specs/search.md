# Module: Global Search / Command Palette

Status: **Implemented (Phase 1 slice)**. Bible reference: Section 28.2
("Global search/command palette can find records and initiate permitted
actions").

## Purpose

A `⌘K`/`Ctrl+K` command palette, reachable from anywhere in the app
shell, that finds a Client/Project/Task/Campaign/Creative/Content
Calendar item/Shoot by name and jumps straight to it — instead of
clicking through Clients → Projects → Campaigns to find one thing.

## Scope boundary — stated explicitly

Section 28.2 pairs two things: "find records" **and** "initiate permitted
actions." This slice builds only the first half. "Initiate permitted
actions" — running a command (e.g. "approve this creative," "create a
project") from the palette rather than just navigating to a record —
is a different, much larger surface that overlaps directly with Cedar
Command Center's job (Section 6, ADR-007), which already owns command
routing and execution. Building a second, parallel command-execution path
here would fragment that responsibility. The palette's only "action" is
navigation to a result.

`Task` was added as a 7th entity type in a follow-up slice — the original
Phase 1 search slice predates Task priority/comments/attachments/
dependencies, and a core, high-frequency record with a real `title` field
being unsearchable was a real, conspicuous gap, not a deliberate scope
decision. `Invoice` remains deliberately out of scope: it has no free-text
name/title field to substring-match against (amount, status, and dates
aren't the kind of thing this palette searches), so adding it would mean
inventing a search key nobody asked for, unlike every other entity here.

## Design

- `search-service.ts`'s `searchRecords` is a stateless, unauthorized query
  function — it takes `organizationId` and an already-resolved
  `clientIds` scope (the same `getReadableClientIds` contract used by
  the Section 12 calendar: `undefined` means "every client," an array
  scopes to exactly those) rather than re-deriving permissions itself.
  This mirrors `calendar-service.ts`'s pattern and keeps the isolation
  guarantee (Section 38) in one place (`getReadableClientIds`), not
  reimplemented per search type.
- Seven entity types are searched in parallel (`Promise.all`), each
  case-insensitive substring match (`ILIKE` via Prisma's
  `mode: "insensitive"`), each capped at 5 results: `Client`
  (name/companyName), `Project` (name), `Campaign` (name), `Creative`
  (type/platform), `ContentCalendarItem` (title), `Shoot` (title), `Task`
  (title, scoped through `project.client.organizationId` — a task result
  links to its project's detail page, the same place `content`/`shoot`
  results link to a list page rather than a dedicated per-item page,
  since neither has its own standalone URL).
- Queries shorter than 2 characters return nothing immediately — avoids
  a wasteful seven-way full-table scan on every keystroke of a
  1-character query.

## Permissions

`GET /api/search` requires a signed-in session (401 otherwise) and always
computes `clientIds` from the caller's own `getReadableClientIds(actor)`
before calling `searchRecords` — a scoped collaborator's search can never
surface a client, project, campaign, creative, content item, or shoot
belonging to a client they can't read. `search-service.ts` itself takes
no actor and does no authorization — callers must always pass an
already-scoped `clientIds`, the same contract `calendar-service.ts` uses.

## APIs / entry points

- `GET /api/search?q=<query>` — returns `{ results: SearchResult[] }`,
  where each result is `{ type, id, title, subtitle, url }`.

## UI

- `CommandPalette.tsx`, mounted in the `(app)` sidebar: a visible
  "Search… ⌘K" button plus a global `⌘K`/`Ctrl+K` keyboard listener, both
  opening the same overlay. Results are grouped by a type badge, debounced
  (200ms), and keyboard-navigable (↑/↓/Enter/Esc). Selecting a result
  navigates via Next's router and closes the palette.

## Jobs

None. Synchronous, same as every other read path in this codebase.

## Failure modes

- **Unauthenticated request**: 401, no query even attempted.
- **Query under 2 characters**: empty result set, no database round-trip.
- **Cross-organization or cross-client-scope leakage**: prevented by
  construction — every one of the six queries filters through the
  organization ID and the (optional) client-ID allowlist before any
  text matching happens.

## Acceptance tests

- `apps/web/src/lib/services/search.integration.test.ts` — 8 tests
  against real Postgres: sub-2-character queries return nothing,
  a matching query finds results across all seven entity types at once,
  a dedicated test that a task title match points at its own project's
  URL (not a nonexistent per-task page), matching is case-insensitive,
  creative type/platform text is searchable, results are correctly
  scoped to a given `clientIds` allowlist (Section 38 isolation), and a
  same-named record in a different organization never leaks into
  results.
- `apps/web/src/app/api/search/route.contract.test.ts` — gained a
  dedicated task test proving a real task is found by title over real
  HTTP and correctly scoped to the caller's readable clients, alongside
  the pre-existing 401/scoping coverage.
- Manual smoke test performed for the original slice against the real
  running server: searched for the seeded demo client by partial name
  and confirmed the result and URL, confirmed a 1-character query
  returned nothing, confirmed an unauthenticated request was rejected
  with 401, searched for seeded project/campaign text and got both
  records back with correct titles/subtitles/URLs, and confirmed the
  "Search… ⌘K" trigger renders in the sidebar.
- Manual smoke test performed for the Task follow-up slice against the
  real running server and dev database: searched for a real seeded
  task's title through the actual `⌘K` palette in a headless browser,
  confirmed a real "Task" badge rendered and selecting the result
  navigated to that task's real project detail page (where the task
  itself is visible), and confirmed the search input's placeholder text
  now mentions tasks.
