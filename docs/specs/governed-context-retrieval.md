# Module: Governed Context Retrieval for Cedar Brain

Status: **Implemented (Phase 3 slice)**. Bible reference: Section 6.1's
Cedar Brain orchestration lifecycle: "Authorize the requested operation
before retrieving sensitive context" and "Retrieve only relevant
governed context from canonical records and knowledge layers."

## Purpose

Before this slice, Cedar Command Center sent nothing but the raw user
prompt to the model — no client data, no brand voice, no health signal,
nothing. Two full lifecycle steps from Section 6.1 were simply skipped.
This implements the first one for real: when a request is scoped to a
specific client, real structured records for that client are retrieved
and injected into the model's context, with authorization checked
*before* any data is touched.

## Why structured queries, not semantic retrieval

Section 6.1 also names "knowledge layers" as a retrieval source, and
Section 19.1 describes a fuller architecture combining structured
queries, semantic retrieval, and graph expansion. ADR-008 already
defers semantic/vector retrieval until there's real unstructured
content worth indexing (meeting notes, briefs) — which this system
still doesn't have. This slice only does the structured-query third of
that architecture, against tables that already exist: `Client`,
`BrandProfileVersion`, `ClientHealthScore`, `ClientTimelineEvent`.

## The service (`context-retrieval-service.ts`)

`buildGovernedContext(actorUserId, organizationId, clientId)`:

1. **Authorization first** — `isAuthorized(clients:read, clientId)` is
   checked before a single row is queried, matching the lifecycle order
   verbatim. A denial throws `AuthError`; it never returns a context
   string with sensitive fields quietly omitted.
2. Retrieves, if they exist: the client's name/company/services, the
   latest `BrandProfileVersion` (tone of voice, target audience,
   products), the latest `ClientHealthScore`, and the 3 most recent
   `ClientTimelineEvent`s.
3. Formats them into one bounded text block (truncated at 2000
   characters — Section 34's "bounded metadata" principle) plus a
   `sources` list naming exactly which real records were included
   (e.g. `"Brand DNA v1"`, `"Client Health Score (82/100)"`) — this is
   what gets shown back to the user, so nothing the model saw is
   invisible to the human who asked.
4. **A section with no real data is omitted, never fabricated** — a
   client with no Brand DNA yet produces no "Brand DNA" section at all,
   confirmed by a dedicated test.

## Wiring into Cedar Brain

- `cedar-brain.ts`'s `callCedarBrain` gained an optional `governedContext`
  parameter, appended to the system prompt under an explicit instruction:
  "use it, don't contradict it, and don't invent facts beyond it."
  `CEDAR_BRAIN_PROMPT_VERSION` was bumped to `v2` since the prompt text
  itself changed (see `docs/specs/ai-supervisor.md`'s prompt-versioning
  convention).
- `/api/cedar-brain/route.ts`: when the request includes a `clientId`,
  retrieval happens before the model call; an `AuthError` here returns
  `403` for the whole request rather than silently proceeding with no
  context. The response now includes `contextSources` so the UI (and
  `CedarBrainRequest`'s stored `response` JSON) can show exactly what
  was retrieved.
- **Command Center (`/command`)**: gained a client picker, scoped to
  exactly the clients the actor can read (the same
  `getReadableClientIds` query `/clients` and the Section 12 calendar
  already use — never every client in the organization). The result
  card shows "Governed context retrieved: ..." naming the real sources
  when a client was selected.

## Scope boundary — stated explicitly

- **No semantic/vector retrieval** (deferred per ADR-008).
- **No cross-client or agency-wide retrieval** — only the one selected
  client's own records, never another client's data or org-wide
  aggregates, even though the actor might be authorized to see both.
- **No "knowledge layer" content** (SOPs, playbooks, Agency
  Memory/Success Library) — those modules don't exist yet (Phase 6).
- **Context isn't persisted separately** — it's included in
  `CedarBrainRequest.response`'s JSON blob (already stored) but has no
  dedicated column; a future increment could add one for easier
  querying, not required to prove this lifecycle step is real.

## Failure modes

- **A client the actor can't read**: the whole request is rejected with
  `403`, before any model call happens.
- **A client from a different organization**: rejected (falls through
  to "Client not found" once the org-scoped lookup fails).
- **A client with some but not all fields populated** (e.g. health
  score but no Brand DNA): only the real sections appear.

## Acceptance tests

- `apps/web/src/lib/services/context-retrieval.integration.test.ts` —
  5 tests against real Postgres: includes real Brand DNA/health/
  timeline data for an authorized actor with the correct sources list;
  omits sections with no real data rather than fabricating placeholders;
  denies retrieval for a client the actor cannot read; allows retrieval
  for a client a scoped actor was explicitly granted access to; rejects
  a client from a different organization.
- Manual smoke test performed for this slice against the real running
  server: submitted a Command Center request scoped to the seeded
  client, confirmed the response's `contextSources` correctly listed
  the real Brand DNA version, health score, and timeline event count
  for that exact client; confirmed the `/command` page's client picker
  only lists real clients the actor can read. All requests were
  read-only aside from the expected `CedarBrainRequest` log row — dev
  database reset to a clean seeded state afterward regardless.
