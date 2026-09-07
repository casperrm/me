# Module: Client Memory — Recent Cedar Brain History

Status: **Implemented (Phase 6 starter slice, extended once)**. Bible
reference: Section 6.6's Memory Layers table — Client Memory: "Brand
facts, decisions, preferences, approvals, client-specific lessons.
Explicit or approved workflow writes; versioned."

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
  *was good*. It does now know whether a human *said* it was bad: a
  flagged-incorrect prior answer (Section 6.3, see
  `docs/specs/ai-supervisor.md`) is excluded from the model-facing
  context (see below). That's a human's explicit signal being
  respected, not this system forming its own judgment — there's still
  no curation, no cross-client pattern extraction, no outcome
  measurement.

## The service (`context-retrieval-service.ts`)

- **`getRecentCedarBrainActivityForClient(clientId, organizationId, limit)`**
  — the real read: the most recent `CedarBrainRequest` rows for one
  client (default 3), including failed ones, with a bounded (150-char)
  excerpt of the stored response's `summary` field (parsed from the
  JSON already stored in `CedarBrainRequest.response`). A malformed or
  legacy response JSON is skipped, never guessed at.
- **`buildGovernedContext`** (Section 6.1) now calls this internally
  and adds a "Prior Cedar Brain answers for this client" section —
  **filtered to successful, never-flagged requests with real content
  only**. A failed request has nothing real to reference. A request a
  real reviewer already flagged incorrect (`flaggedIncorrect`, set by
  `flagCedarBrainRequest` — see `docs/specs/ai-supervisor.md`) has no
  business being served back as a trusted precedent for the next
  request, even though it succeeded and has real content. Both are
  still shown to a human on the client profile page (a failure or a
  flag is exactly what a human should see there; neither is useful as
  model input).

## UI

Client profile page: a "Cedar Brain Activity" card (shown only when
history exists), listing each past request's date, prompt, and summary
excerpt, with failed requests marked "failed" and flagged-incorrect
requests marked "flagged incorrect" (both badges render independently —
a request can in principle be flagged without having failed, or vice
versa, though in practice only a successful request can be flagged at
all, since there's nothing to judge in a failure). Labeled "Client
Memory (Section 6.6)" so its provenance in the Bible's own framing is
explicit rather than implied.

## Failure modes

- **A client with no Cedar Brain history**: no card renders, no context
  section is added — never a fabricated "no prior activity" placeholder
  filling space.
- **A failed prior request**: excluded from the model-facing context
  entirely; still visible on the client profile page for a human,
  marked "failed."
- **A flagged-incorrect prior request**: excluded from the model-facing
  context entirely, even though it succeeded and has real content;
  still visible on the client profile page for a human, marked "flagged
  incorrect."
- **Malformed `response` JSON** (shouldn't happen with the current
  write path, but not assumed): the excerpt is omitted for that row
  rather than the whole read failing.

## Acceptance tests

- `apps/web/src/lib/services/context-retrieval.integration.test.ts` —
  9 tests total (up from 8 before this slice): the main "includes real
  data" test asserts the prior successful,
  non-flagged answer's real content appears in both the context text
  and its `sources` list; a dedicated test confirms a failed prior
  request's content is never fed into the context even though a
  successful one for the same client is; a second dedicated test
  (added this slice) confirms a flagged-incorrect prior request's
  content is never fed into the context either, even though it
  succeeded and has real content; and a `describe` block directly
  tests `getRecentCedarBrainActivityForClient` — successful, failed,
  and flagged rows all returned (most-recent-first, each with the
  correct `flaggedIncorrect` value), and an empty result for a client
  with no history.
- Manual smoke test performed for the first slice against the real
  running server: submitted two Command Center requests scoped to the
  same seeded client, confirmed the second request's `contextSources`
  correctly included "1 prior Cedar Brain answer(s)" from the first,
  and confirmed both requests appeared on that client's profile page's
  "Cedar Brain Activity" card; dev database reset to a clean seeded
  state afterward.
- Manual smoke test performed for the flagged-exclusion slice against a
  real running production server: submitted a real Command Center
  request scoped to the seeded client (`contextSources` correctly
  listed no prior answers, since none existed yet), flagged it incorrect
  through the live `/api/cedar-brain/[id]/flag` route, cross-checked via
  `psql` that the row was genuinely `success: true` with a real response
  and `flaggedIncorrect: true` (so it would otherwise have qualified),
  then submitted a second request for the same client and confirmed its
  `contextSources` did **not** include a "prior Cedar Brain answer(s)"
  entry — the flagged answer was correctly excluded, not just in the
  test suite but against a real live request/response round trip.
  Confirmed the "flagged incorrect" badge itself rendered on the client
  profile page via a real headless-browser check. Both rows deleted
  afterward, dev database confirmed back at its pre-test row count.
