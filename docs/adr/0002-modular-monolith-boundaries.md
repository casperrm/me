# ADR-002: Modular monolith boundaries and extraction criteria

- **Status:** Accepted
- **Date:** 2026-09-06

## Context

Bible Section 0.1/25.1 asks for a modular monolith with clean boundaries
and explicit extraction seams, not microservices from day one. Phase 0
needs to decide where authorization-sensitive use cases (login, invite,
role change) actually live: `apps/web` (as Next.js server actions/route
handlers) or behind `apps/api`'s HTTP surface.

## Decision

Phase 0 use cases (`bootstrapOrganization`, `login`, `logout`,
`createInvitation`, `acceptInvitationFlow`, `changeMemberRole`,
`revokeMembership`, `grantClientScope`) live in
`apps/web/src/lib/services/*` and are called directly from server
components, server actions, and route handlers in the same app.
`packages/application` exists as an empty placeholder for the moment a
second caller needs this logic — not populated speculatively.

`apps/api` stays a thin health/readiness surface until there's an actual
second consumer (Client Portal as its own app, a public API, a mobile
client) that can't just import a Next.js server action.

## Alternatives considered

- **Put everything behind `apps/api` from day one** — rejected for now:
  the only caller today is `apps/web` itself; routing every mutation
  through a second HTTP hop adds latency and a second auth boundary to
  maintain with no current benefit. Section 0.1 explicitly says prefer the
  simplest design and note the choice, which is what this is.
- **tRPC router shared between web and api** — deferred: reasonable when
  the second caller arrives; not worth the setup cost for one caller.

## Consequences

- Authorization is still fully centralized (`packages/auth`'s
  `requirePermission`/`isAuthorized`, backed by `packages/domain`'s `can()`)
  regardless of which app calls it — the boundary being crossed here is
  "which process calls the use case," not "who checks permissions."
- `packages/db`'s Prisma client is currently imported directly by
  `apps/web`. If `apps/api` later owns writes to a given table, that
  ownership move happens without a domain model change — Prisma
  models/queries already live in `packages/db`, not scattered in `apps/web`.

## Migration/rollback

**Extraction trigger:** the first time a second application (Client
Portal, public API, mobile) needs one of these use cases. At that point,
move the specific use case's logic into `packages/application`, expose it
from `apps/api` as an HTTP endpoint, and have `apps/web` call that endpoint
instead of the local service function. No schema or domain-model change is
required — only the call site moves.
