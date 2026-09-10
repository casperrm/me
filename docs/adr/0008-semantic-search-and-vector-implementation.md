# ADR-008: Semantic search / vector implementation

- **Status:** Proposed — not yet implemented
- **Date:** 2026-09-06
- **Updated:** 2026-09-10 — Section 19.1's other half, "structured
  queries first for canonical facts," gained one more real relational
  hop: `context-retrieval-service.ts`'s `buildGovernedContext` now also
  walks Section 19's own example chain, "Client -> Meeting -> Decision"
  (`Meeting.decisions`, which existed since the Meetings module landed
  but was never queried here despite this file's own doc comment citing
  it as in scope). Still no semantic/vector retrieval or graph
  expansion — this decision is unchanged. See
  `docs/specs/knowledge-graph-meeting-decisions.md`.
- **Updated:** 2026-09-10 — Section 19.2 (Knowledge Promotion) got its
  first real cut: a new `AgencyMemoryEntry` table and
  `promoteMeetingDecisionToMemory()`, triggered only by explicit human
  curation (a person clicking "Promote to Agency Memory" on a meeting
  decision), never automatically. This is promotion machinery, not
  retrieval — `AgencyMemoryEntry` rows are not yet wired into
  `buildGovernedContext`'s retrieval above, so Cedar Brain still cannot
  see promoted knowledge; that wiring, plus real semantic/vector
  retrieval, both remain future work this decision still defers. See
  `docs/specs/agency-memory.md`.
- **Updated:** 2026-09-10 — the retrieval gap the entry immediately above
  named is now closed: `buildGovernedContext` queries the 5 most recent
  `AgencyMemoryEntry` rows org-wide and adds them as a real, sourced
  context section. Still structured queries only (a `findMany` ordered by
  `promotedAt`, not a similarity/relevance ranking) — this decision's core
  scope (no semantic/vector retrieval, no graph expansion) is still
  unchanged; only Section 19.2's own promoted-knowledge layer is now
  actually reachable by Cedar Brain. See
  `docs/specs/agency-memory.md`'s "Follow-up" section.

## Context

Bible Section 19.1 describes a retrieval architecture combining structured
queries, semantic retrieval, and graph expansion. There is no unstructured
content (meeting notes, briefs, knowledge items) worth indexing yet —
Phase 0 only has structured relational data.

## Decision

Not yet made. When Agency Memory / Knowledge Engine (Phase 5-6) needs
semantic retrieval, evaluate starting with a Postgres extension
(`pgvector`) before standing up dedicated vector infrastructure — Section
25.2's own "Logical Components" table suggests exactly this sequencing
("may begin with PostgreSQL extensions before dedicated infrastructure").

## Consequences of deferring

No embeddings, no `EmbeddingRef` table yet. Building this prematurely over
near-empty tables would violate the project's own stated principle
(`VISION.md`'s closing rule / Bible Section 0.1): don't add capability
before there's something real for it to do.
