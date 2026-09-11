# Audit Log Viewer

- **Status:** Implemented (first cut)
- **Bible sections:** 23.2 (Audit Event Minimum Schema), 27 (Data
  Architecture and Database Rules — "Audit records are append-oriented and
  protected from ordinary mutation")
- **Date:** 2026-09-11

## The gap

`AuditEvent` has been fully populated by every write path in this app
since Phase 0 — `emitAuditEvent` (`packages/events`) is the only writer,
called from every mutating service function, carrying actor, action,
resource, client, timestamp, correlation id, `changeSet`, `approvalId`,
result, and an integrity hash (Section 23.2's full field list). Nothing
has ever read it back.

More specifically: `audit:read` has been a real permission in the RBAC
catalog (`packages/domain/src/roles.ts`) since Phase 0, granted to
ADMIN/OWNER by default — but a repo-wide search found **zero call sites**
checking it anywhere, on any page or route, before this slice. That's the
same "declared but never wired" shape this project has caught and fixed
elsewhere this session (`AuditEvent.approvalId` before
`docs/specs/audit-event-approval-linkage.md`, whose own "Scope" section
named exactly this as the explicit follow-up: "No UI surfaces `approvalId`
yet... building a UI consumer for it is a separate, smaller follow-up.")
This slice is that follow-up, and it also finally gives `audit:read` its
first real consumer.

## What was built

`apps/web/src/lib/services/audit-log-service.ts` exports
`listAuditEvents(params)`:

- Gated on `audit:read`, org-wide (not in `CLIENT_SCOPABLE_PERMISSIONS` —
  audit oversight is inherently an org-wide concern, the same reasoning
  `/command/supervisor` already uses for `ai:supervise`).
- Paginated (`PAGE_SIZE = 30`), same offset-pagination shape every other
  Phase 7 scale-hardening slice already established.
- Optional `resourceType` filter.
- Resolves each event's real actor label: a `USER` actor's `Membership`
  id resolves to the real member's name; an `AI_AGENT` actor's raw name
  (e.g. `"cedar-brain"`) is shown as-is; `SYSTEM` shows as `"System"`.
  Resolves each event's `clientId` to a real client name when present.
  Both lookups are batched (`findMany` with `id: { in: [...] }`), not
  N+1 queries per row.

New `/audit` page (new "Audit Log" nav item, same `isAuthorized`-gated
conditional-nav-item pattern every other permission-gated nav entry
already uses): each row shows a result badge (SUCCESS/FAILURE/DENIED),
the action, a clickable resource-type filter link, the resolved actor,
the client (linked to `/clients/[id]` when present), the `approvalId`
when present, the timestamp, and a collapsible pretty-printed `changeSet`.

Pagination links are **not** built with the shared `Pagination` component
— that component's `${basePath}?page=${n}` composition assumes no other
query params exist, which would silently drop this page's `resourceType`
filter when navigating between pages. This page builds its own two-link
pager with `URLSearchParams`, preserving both `resourceType` and `page`
together.

## Explicit scope boundary — what this deliberately does NOT do

- **No export/download of the audit trail.** Section 23.1 separately
  mentions "export/delete workflows consistent with applicable
  obligations" — a real compliance feature with its own retention-policy
  questions this slice doesn't invent answers to.
- **No integrity-chain verification tool.** `integrityHash` (ADR-006's
  tamper-evidence chain) exists on every row and is stored, but nothing
  here walks the chain to prove it's unbroken — a genuinely separate,
  larger feature (and its own UI) with no urgency behind it yet.
- **No full-text search across actions/resources**, only the one
  `resourceType` filter. A broader filter UI (by actor, date range,
  result) is a reasonable later increment, not built here — this is the
  smallest real cut that gives `audit:read` and `approvalId` their first
  actual consumer.
- **No correlation-id cross-reference UI.** `correlationId` is returned
  by the service and would let someone jump from one audit event to every
  other row (or worker-job log line, per
  `docs/specs/worker-log-correlation.md`) sharing the same id — but no
  API-route-level correlation IDs exist yet (that doc's own named,
  deliberately-deferred gap: "much larger... would mean touching all ~61
  route handlers"), so most audit events still have `correlationId: null`
  and there is nothing to cross-reference against yet.

## Tests

`apps/web/src/lib/services/audit-log.integration.test.ts` — 4 tests
against real Postgres (no `server-only`/`next-headers` mocks needed; pure
Prisma + `@cedar/auth` module, same shape as `opportunity-service.ts`):

- Real events (one `USER`, one `SYSTEM`, one `AI_AGENT`) return newest
  first with correctly resolved actor labels and client name.
- `resourceType` filter returns only matching rows.
- A member with no `audit:read` is rejected.
- Never leaks another organization's audit events.

## Verification performed

- `npx tsc --noEmit` on `apps/web` and every workspace: clean.
- `npx eslint`: clean.
- Full `apps/web` vitest suite: 628/628 passed (96 files).
- Full monorepo `npm run typecheck --workspaces`: clean on all 15
  packages.
- Production build (`next build`): succeeded, `/audit` route built.
- Live smoke test against a real running production build: confirmed the
  "Audit Log" nav item renders for the real OWNER actor, confirmed the
  page shows genuine history (every real login session this entire
  multi-day build-out session created, plus the real `org.seeded` SYSTEM
  event with a real `changeSet`), screenshot-verified, no crash. Verified
  the `resourceType` filter server-side by navigating directly to
  `?resourceType=User` (showed only session events, correctly excluding
  `org.seeded`) and `?resourceType=Organization` (showed only
  `org.seeded`, correctly excluding session events) — proving the filter
  genuinely constrains the query rather than just labeling the page. This
  was a read-only smoke test; no fixture rows were inserted or needed
  cleanup.
