# Architecture

Authoritative spec: `docs/CEDAR_POINT_OS_BIBLE.md`. This document explains
how the current codebase implements its Section 35 repository blueprint
and Section 25 technical architecture, and records the concrete choices
made along the way (see `docs/adr/` for the full reasoning behind each).

## Repository shape

A TypeScript-first npm-workspaces monorepo, per Bible Section 35:

```
/apps/web          Next.js (App Router) — team UI + most current use-case logic
/apps/api          Fastify — health/readiness only today (ADR-002)
/apps/worker       BullMQ/Redis — process boundary proven, no real jobs yet (ADR-004)
/packages/domain   Pure RBAC policy — Role/Permission types, can(), no I/O
/packages/application  Empty — populated when a second app needs a shared use case (ADR-002)
/packages/db       Prisma schema + migrations + seed (PostgreSQL, ADR-003)
/packages/auth     Sessions, password hashing, invitations, authorization glue (ADR-006)
/packages/events   Append-only audit event emission
/packages/ai       Empty — Cedar Brain's real home once Phase 3 lands (ADR-007)
/packages/connectors  Empty — connector SDK, Phase 4 (Section 34's adapter contract)
/packages/automation  Empty — workflow engine, Phase 1-2+
/packages/ui       Empty — shared components extracted once a second UI surface exists
/packages/observability  Structured JSON logger with correlation IDs
/packages/config   Typed env validation (zod), shared by every app
/docs/adr          Architecture Decision Records (numbered per Bible Section 41)
/docs/specs        Per-module specs (Bible Section 40)
```

Every "empty" package above is a deliberate boundary reservation, not an
oversight — see each package's `src/index.ts` comment and the
corresponding ADR for what would trigger filling it in. This is the
concrete form of Bible Section 0.1's "prefer a modular monolith... with
clean boundaries and extraction seams."

## Identity & Access (Phase 0 — implemented)

The layer everything else depends on. See `docs/specs/identity-access.md`
for the full module spec. In one sentence: `packages/domain`'s `can()` is
a pure function of (actor role + status, their `ScopedGrant` rows,
requested permission, target client) with zero I/O; `packages/auth` is the
only place that function meets the database (loading a `Membership` and
its grants, then calling `can()`); every protected page/action in
`apps/web` calls into `packages/auth`, never re-implements a check inline.

This is what makes the Bible's Section 38 acceptance scenarios
mechanically true rather than aspirational:

- *"Owner invites a collaborator, assigns a scoped role, and the
  collaborator cannot access unauthorized clients or finance"* —
  `packages/domain/src/policy.test.ts` encodes this directly as unit
  tests against `can()`.
- *"Cross-client access attempts fail at the API layer even if a user
  manipulates frontend identifiers"* — every client-scoped query in
  `apps/web` filters `WHERE id = ? AND organizationId = ?` before any
  permission check runs, so a guessed ID from another organization 404s
  rather than reaching the authorization layer at all (see
  `apps/web/src/app/(app)/clients/[id]/page.tsx`).

## Data model = the knowledge graph's first layer

Bible Section 19 asks for `Client ↔ Brand ↔ Project ↔ Campaign ↔ Creative
↔ Result ↔ Invoice ↔ Meeting ↔ Decision` etc. to be one interconnected
structure, not ten silos. `packages/db/prisma/schema.prisma` is written so
that's true from the start — every entity below `Client` carries a
foreign key back to it (directly or via `Project`), so "everything about
this client" is always one query away. Identity sits alongside it:
`Organization → Membership → User`, with `ScopedGrant` and `AuditEvent` as
the access-control and governance layers over the same graph.

A literal graph database isn't needed yet (ADR-008) — the relational shape
already supports correct traversal in every direction Section 19 lists.
Promote a query pattern to a graph/vector store only once there's a real
retrieval need it doesn't serve well (Section 19.1's own sequencing:
structured queries first).

## Cedar Brain: router today, multi-agent orchestrator tomorrow

`apps/web/src/lib/cedar-brain.ts` is the seam Bible Section 6.1 describes.
Today: a keyword classifier decides which named agents a prompt touches,
then one call to the Anthropic API (or a deterministic stub without an API
key) produces a combined response, logged to `CedarBrainRequest`. See
ADR-007 for the gap between this and the Bible's full orchestration
lifecycle (permission-checked context retrieval, per-agent specialization,
provenance, cost governance) — deliberately not built until Phase 3, since
building it now over empty `AgentRun`/`Evaluation` tables would be
premature.

## Module boundary rules (apply to every new module)

1. Attach to `Organization`, `Client`, `Project`, `Campaign`, or `Creative`
   — never invent a parallel client/project concept (Bible Section 3).
2. Every mutating action goes through `packages/auth`'s
   `requirePermission` first, and logs an `AuditEvent` via
   `packages/events` (Section 23.2's minimum schema is implemented
   field-for-field — don't bypass it with a bespoke log line).
3. Anything that publishes externally or spends money follows Section 21:
   **AI/automation prepares → a human approves → the system executes.**
   No module skips the approval step for those actions, including ones
   built later. (The `Approval` model exists in the schema; the general
   approval *workflow* UI is Phase 2 — see ROADMAP.md.)
4. New workspace packages get a real `package.json`/`tsconfig.json` even
   while empty, so the Section 35 boundary exists in the repo from the
   moment it's relevant, not retrofitted later.

## Known environment-specific gotcha

**Do not add `NODE_ENV` to the shared root `.env`.** Next.js sets it
itself per command (`dev`/`build`/`start`); an explicit value inherited
from a monorepo-wide `.env` loaded via `dotenv-cli` breaks `next build` in
this npm-workspaces layout in a very confusing way (crashes while
prerendering the framework's own default `/404`/`/500` fallback pages,
with React-internals errors that have nothing to do with actual page
code). Confirmed by bisection during Phase 0 — see ADR-001 for the full
story. `.env.example` and `packages/config` intentionally leave it out of
the shared contract.
