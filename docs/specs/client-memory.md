# Module: Client Memory — Recent Cedar Brain History

Status: **Implemented (Phase 6 starter slice)**. Bible reference:
Section 6.6's Memory Layers table — Client Memory: "Brand facts,
decisions, preferences, approvals, client-specific lessons. Explicit or
approved workflow writes; versioned."

## Purpose

ADR-007 and `ROADMAP.md` both noted the same gap in the same words:
"`CedarBrainRequest` logs every Command Center call today, which is the
raw material Agency Memory will eventually read from — nothing reads it
back yet." This slice is that first read — the simplest honest form of
Client Memory this system can build with data that already exists,
with no invented curation or outcome-measurement machinery.

## Why this counts as real Client Memory, and what it deliberately isn't

Every `CedarBrainRequest` already carries an optional `clientId` (set
when a Command Center request is scoped to a client — see
`docs/specs/governed-context-retrieval.md`). Reading that history back,
per client, and feeding the successful ones into the *next* request
about that same client is exactly Section 6.6's description: a
client-specific record that a later workflow reads from. It is **not**:

- **Agency Memory** (Section 6.6's next row: "Campaigns, creative
  patterns, SOPs, decisions, lessons... Curated or outcome-triggered;
  provenance required") — there's no curation step, no cross-client
  pattern extraction, and no outcome measurement here. This is one
  client's own history, read back verbatim, not a distilled lesson.
- **A "lesson learned"** — nothing here judges whether a prior answer
  was good. A flagged-incorrect prior answer (Section 6.3, see
  `docs/specs/ai-supervisor.md`) is still eligible to be fed back as
  context today; teaching the retrieval to exclude flagged answers
  would be a reasonable next increment, not built here.

## The service (`context-retrieval-service.ts`)

- **`getRecentCedarBrainActivityForClient(clientId, organizationId, limit)`**
  — the real read: the most recent `CedarBrainRequest` rows for one
  client (default 3), including failed ones, with a bounded (150-char)
  excerpt of the stored response's `summary` field (parsed from the
  JSON already stored in `CedarBrainRequest.response`). A malformed or
  legacy response JSON is skipped, never guessed at.
- **`buildGovernedContext`** (Section 6.1) now calls this internally
  and adds a "Prior Cedar Brain answers for this client" section —
  **filtered to successful requests with real content only**. A failed
  request has nothing real to reference, so it's excluded from what
  gets fed back into the next model call, even though it's still shown
  to a human on the client profile page (failures are exactly what a
  human should see; they're not useful as model input).

## UI

Client profile page: a new "Cedar Brain Activity" card (shown only when
history exists), listing each past request's date, prompt, and summary
excerpt, with failed requests visibly marked. Labeled "Client Memory
(Section 6.6)" so its provenance in the Bible's own framing is explicit
rather than implied.

## Failure modes

- **A client with no Cedar Brain history**: no card renders, no context
  section is added — never a fabricated "no prior activity" placeholder
  filling space.
- **A failed prior request**: excluded from the model-facing context
  entirely; still visible on the client profile page for a human,
  marked "failed."
- **Malformed `response` JSON** (shouldn't happen with the current
  write path, but not assumed): the excerpt is omitted for that row
  rather than the whole read failing.

## Acceptance tests

- `apps/web/src/lib/services/context-retrieval.integration.test.ts`
  gained 3 new tests (8 total in the file): the main "includes real
  data" test now also asserts the prior successful answer's real
  content appears in both the context text and its `sources` list; a
  dedicated test confirms a failed prior request's content is never fed
  into the context even though a successful one for the same client is;
  and a new `describe` block directly tests
  `getRecentCedarBrainActivityForClient` — both success and failure
  rows returned most-recent-first with a real summary excerpt, and an
  empty result for a client with no history.
- Manual smoke test performed for this slice against the real running
  server: submitted two Command Center requests scoped to the same
  seeded client, confirmed the second request's `contextSources`
  correctly included "1 prior Cedar Brain answer(s)" from the first,
  and confirmed both requests appeared on that client's profile page's
  new "Cedar Brain Activity" card; dev database reset to a clean seeded
  state afterward.
