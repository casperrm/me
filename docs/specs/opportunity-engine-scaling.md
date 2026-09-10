# Module: Opportunity Engine Scaling (Phase 7 — Scale Hardening)

Status: **Implemented**. Closes the second-ranked remaining item from
the Phase 7 audit documented in `docs/specs/dashboard-aggregates.md`'s
"Scope boundary" section (`opportunity-service.ts:43-49` in the
original citation).

## The problem

`getOpportunitiesForClient` (Bible Section 4.2) runs on every client
detail page load. Its creative-format-gap signal needs, for each
distinct creative format, how many *other clients in the organization*
have used it. The original implementation computed this by fetching
**every creative row for every other client in the organization**,
then reducing over the full array in Node:

```ts
const otherCreatives = await prisma.creative.findMany({
  where: { campaign: { project: { client: { organizationId, id: { not: clientId } } } } },
  select: { type: true, campaign: { select: { project: { select: { clientId: true } } } } },
});
const formatToClients = new Map<string, Set<string>>();
for (const creative of otherCreatives) {
  const peerClientId = creative.campaign.project.clientId;
  if (!formatToClients.has(creative.type)) formatToClients.set(creative.type, new Set());
  formatToClients.get(creative.type)!.add(peerClientId);
}
```

This is a full-organization creative-history scan, transferred row by
row, run again on every single client's page view — the amount of data
pulled grows with the organization's entire creative output over time,
not with anything about the specific client being viewed.

The client's own format history had the same shape: `ownCreatives`
fetched every one of the client's own creative rows just to build a
`Set` of the distinct types.

## The fix

### Own formats: `distinct`

```ts
prisma.creative.findMany({
  where: { campaign: { project: { clientId } } },
  select: { type: true },
  distinct: ["type"],
})
```

Same information (the client's own distinct format set), transferred
as one row per distinct type instead of one row per creative ever
made.

### Peer formats: push the GROUP BY into Postgres

The `services` gap signal (below) can't get the same treatment,
because `Client.services` is a plain `String` column storing a JSON
array (not a `jsonb` column Postgres can index or `GROUP BY` into) —
see "What did NOT change" below. Creative format has no such
obstruction: `type` is a plain string column reachable through a
3-table join (`creative → campaign → project → client`), so the count
this signal actually needs — distinct peer clients per format — is
expressed directly as one `GROUP BY`:

```ts
prisma.$queryRaw<{ type: string; peerCount: bigint }[]>`
  SELECT cr.type AS type, COUNT(DISTINCT p."clientId")::bigint AS "peerCount"
  FROM creatives cr
  JOIN campaigns cam ON cam.id = cr."campaignId"
  JOIN projects p ON p.id = cam."projectId"
  JOIN clients c ON c.id = p."clientId"
  WHERE c."organizationId" = ${organizationId} AND c.id != ${clientId}
  GROUP BY cr.type
`
```

Both `organizationId` and `clientId` are passed through Prisma's
tagged-template `$queryRaw`, which parameterizes them automatically —
no string concatenation, no injection surface. The query returns one
row per distinct format value that exists among peer clients (in
practice, a handful of rows: the number of format types actually in
use), regardless of how many thousand creatives the organization has
produced.

## What did NOT change

- **The service-gap signal (peer clients' `services` field) is
  unchanged.** It still loads every other client in the organization
  with `select: { services: true } }`. This is deliberate, not an
  oversight: `Client.services` is stored as a JSON-encoded `String`
  column, not `jsonb`, so there's no clean SQL-side way to `GROUP BY`
  its contents without either a raw JSON-parsing expression per row
  (fragile) or a schema migration to a real `jsonb` column or a
  join table (a real, separately-scoped change — out of bounds for a
  query-shape-only slice). This query's cost also scales with
  organization-wide *client count*, not creative *history* — the
  Bible's own scale target is 500 clients, meaning at most 500 rows of
  one text column, which is a fundamentally smaller and slower-growing
  problem than the unbounded creative-history scan this slice fixed.
- **Output and behavior are byte-identical.** Same `Opportunity[]`
  shape, same `MIN_PEER_COUNT` threshold, same sort order. Every
  existing test in `opportunity.integration.test.ts` passed unchanged
  against the rewrite, including the one most likely to catch a
  `GROUP BY`/`COUNT(DISTINCT)` mistake: "counts distinct peer clients,
  not distinct creatives — one prolific peer isn't 'evidence' on its
  own" (5 creatives from 1 peer must not count as 5).

## Verification

- `npx tsc --noEmit` (apps/web) and `npm run -ws typecheck` (whole
  monorepo): clean.
- `next lint`: no warnings or errors.
- All 5 existing `opportunity.integration.test.ts` tests pass
  unchanged against the rewrite (proving behavioral equivalence,
  including the distinct-peer-vs-distinct-creative edge case).
- New test added: "computes correct per-format peer counts via a
  single GROUP BY when peers use multiple formats" — exercises three
  peer clients across two distinct formats plus the target client's
  own 3-row single-format history in one call, the shape most likely
  to expose a `GROUP BY` correctness bug that a single-format test
  can't catch (rows crossing between groups, or an own-format
  `distinct` query failing to collapse duplicate rows).
- Full `apps/web` vitest suite: 158/158 passing across 27 files.
- `npm run build --workspace=@cedar/web`: succeeds, no route changes
  (this is a service-layer change with no new routes).
- **Live smoke test against the real running server and the seeded dev
  database, with a direct-SQL cross-check**: the dev database has only
  one client (no peers to compare against), so two temporary peer
  clients were inserted via direct SQL, each with one `podcast_episode`
  creative. Ran the exact `GROUP BY` query from the service directly
  against Postgres — confirmed `podcast_episode` → 2 peers. Then logged
  in as the seeded owner and loaded the real client detail page over
  HTTP: the Opportunities card rendered `"2 other clients have
  \"podcast_episode\" creative work; none for this client yet."` — an
  exact match to the direct-SQL result, proving the raw-SQL rewrite
  produces correct output through the full real request path, not just
  in isolated tests. All inserted test rows (2 clients, 2 projects, 2
  campaigns, 2 creatives) were deleted afterward, restoring the dev
  database's original single-client state.

## Scope boundary — what's still open

At the time this slice was written, the Phase 7 audit
(`docs/specs/dashboard-aggregates.md`) still had other ranked items
open: the clients list page, the content calendar's per-client lists,
the Client Portal's external-facing lists, the shoots page, and
asset-picker dropdowns. **Update:** every one of those has since landed
as its own follow-up slice (see ROADMAP.md's Phase 7 section) — this
note is kept for history, not as an open item list. The service-gap
signal's `Client.services` scan (above) is a real but lower-priority
item that was ranked below the others and remains unaddressed — bounded
by client count rather than history, so it's a smaller win than the
others were. Note this isn't a pending TODO: the code comment on that
scan (`opportunity-service.ts`) already gives the reason it's fine
as a plain Node-side scan rather than raw SQL — it's bounded by
organization-wide client count (the Bible's own 500-client scale
target), not by unbounded history, so it doesn't grow the way the
creative-format queries above did.

## Acceptance

- `apps/web/src/lib/services/opportunity-service.ts` — own-format
  query switched to `distinct`, peer-format query switched to a raw
  SQL `GROUP BY`.
- `apps/web/src/lib/services/opportunity.integration.test.ts` — 1 new
  test (5 total, up from 4).
