# Knowledge Graph v1 — Client -> Meeting -> Decision

Bible reference: Section 19 ("Represent meaningful relationships such
as... Client -> Meeting -> Decision -> Task") and 19.1 ("Structured
queries first for canonical facts and metrics... Every AI answer that
relies on internal knowledge should retain source/resource references
for traceability").

## The gap

`context-retrieval-service.ts`'s `buildGovernedContext` already does
Section 19.1's "structured queries first" half — it was built for
Section 6.1 originally, pulling Brand DNA, Client Health Score, and
recent timeline events for a client into Cedar Brain's context — but
its own top-of-function doc comment cited Section 6.6's "decisions...
client-specific lessons" as part of what it covers, while never actually
querying `Meeting.decisions` anywhere. Confirmed by grep before starting
this slice: zero references to `Meeting` anywhere in the file. The exact
relationship Section 19 names as its own worked example — "Client ->
Meeting -> Decision" — was never walked, even though every piece of it
(the `Meeting` model, its `decisions` JSON column, the `Client.meetings`
relation) already existed from the Meetings module (Section 13, a
previous slice).

## What's built

- `buildGovernedContext` now also fetches the 3 most recent `Meeting`
  rows for the client (`Client.meetings`, ordered by `occurredAt desc`),
  selecting only `title`, `occurredAt`, and `decisions` — no new query,
  just one more relation on the same `prisma.client.findFirst` call this
  function already made.
- Only meetings that actually recorded a decision contribute anything: a
  meeting with an empty or null `decisions` column produces no line, no
  placeholder, nothing — same "omit sections with no real data" pattern
  every other section in this function already follows.
- Each decision line cites its meeting's date and title
  (`- 2026-09-10 (Q1 kickoff): Launch on the 15th, not the 1st.`), and
  the `sources` array gets a real, countable entry (`"N recent meeting
  decision(s)"`) — satisfying 19.1's "retain source/resource references
  for traceability" the same way every other context section here
  already does.
- Reuses `MeetingDecision` (`meeting-service.ts`'s existing exported
  type) rather than redefining the shape here.

## Scope — explicitly not built

Section 19 and 19.1/19.2 ask for considerably more than this:

- **No graph database or generalized relationship model.** This is one
  more relational query joined into a function that already does
  several — not a graph store, not a generic "expand N hops from any
  entity" traversal engine. The rest of Section 19's example chain
  (`-> Task`, and the separate `Client -> Meeting -> Decision` financial/
  integration variants) stays unbuilt; this is one real hop, chosen
  because it was the one this function's own comment already claimed
  and never delivered.
- **No semantic/vector retrieval** (19.1's "semantic retrieval for
  unstructured notes, briefs, meetings, SOPs") — still deferred per
  ADR-008, for the same reason as always: no embedding infrastructure,
  and `ANTHROPIC_API_KEY` unset means no live model calls to generate or
  consume embeddings against even if the infrastructure existed.
- **No graph expansion or reranking** (19.1's "graph expansion to
  collect relevant neighboring entities" and "rerank and context-budget
  results") — this function's existing flat `MAX_CONTEXT_CHARS`
  truncation is the only context-budget mechanism here, unchanged by
  this slice.
- **No knowledge promotion** (19.2: "raw AI output is not automatically
  institutional knowledge... requires an approved outcome, explicit
  curation..."). Nothing here curates, scores confidence, or tracks
  supersession — a meeting decision is read back verbatim, the same
  "real record, no fabricated judgment" stance `docs/specs/client-memory.md`
  already takes for prior Cedar Brain answers.

## Testing

- `apps/web/src/lib/services/context-retrieval.integration.test.ts`
  (extended, against real Postgres): two meeting fixtures added for the
  existing test client — one with a real decision, one without. The main
  "includes real..." test now also asserts the decision text, the
  meeting's title, and the `"1 recent meeting decision(s)"` source
  appear. A new dedicated test confirms the decision-less meeting's
  title never appears anywhere in the context text (proving the
  filter, not just the inclusion, works). 10 tests total, up from 9.
- Live-verified via a real HTTP request against a running production
  build: created a real `Meeting` with a real decision for the seeded
  client, called the real `POST /api/cedar-brain` route (as the seeded
  owner), and confirmed the response's `contextSources` included `"1
  recent meeting decision(s)"` — proving the real end-to-end path, not
  just the service function in isolation. (First attempt against a
  stale `next start` process still bound to the port from an earlier
  smoke test in the same session returned the pre-change response —
  caught by checking `ps`/the port, killed the stale process, restarted
  cleanly, and reconfirmed.) The meeting and the `CedarBrainRequest` row
  it produced were deleted afterward; confirmed the dev database was
  back to its seeded baseline.
