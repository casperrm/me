# ADR-003: PostgreSQL schema and migration strategy

- **Status:** Accepted
- **Date:** 2026-09-06
- **Updated:** 2026-09-10 — Section 27.1's "version/concurrency field on
  collaboratively edited records" rule was only half-implemented:
  `Membership.version` existed and was incremented on every write, but
  nothing ever compared it before writing, so it couldn't actually catch
  a lost update. `changeMemberRole`/`revokeMembership` now condition
  their writes on the expected version inside the same `updateMany`
  call. See `docs/specs/membership-optimistic-concurrency.md`.

## Context

Bible Section 27 mandates PostgreSQL as the canonical database with UUID
IDs, `organization_id`/`client_id` scoping, `created_at`/`updated_at`, and
append-only audit records. Section 3 gives the target domain entity list.

## Decision

- **Prisma** as ORM + migration tool (`packages/db/prisma/schema.prisma`).
  Migrations are generated files under `packages/db/prisma/migrations/`,
  applied via `prisma migrate dev` (local) / `prisma migrate deploy` (CI/
  production) — both forward-only and reversible by writing a new
  down-migrating schema change, per Section 27's "reversible or documented
  safe forward-recovery" requirement.
- **IDs:** `String @default(uuid())` (application-generated UUIDv4), not
  DB-generated (`gen_random_uuid()`). Simpler to reason about across
  Prisma's query builder and keeps ID generation portable if the
  datasource ever changes.
- **Role is a native Prisma enum** (`Role`), backed by a Postgres enum
  type — safe because production targets Postgres, not SQLite (which
  doesn't support enums; this schema has no SQLite fallback, unlike the
  pre-Bible prototype).
- **Money, when it lands (Finance module, Phase 5):** integer minor units
  + ISO currency string, never floating point, per Section 27.1 — already
  the pattern in the carried-forward `Invoice`/`Campaign.budgetCents`
  fields.
- **JSON-as-string fields** (`services`, `colors`, `kpis`, etc.) are a
  deliberate interim choice for data that doesn't need relational querying
  yet (Section 27.1: "denormalize only for measured read/performance
  needs" cuts the other way too — don't over-normalize speculative
  shapes). Promote a field to a real relational table the moment something
  needs to query inside it (e.g., "find all clients using color #F5C518").
- **AuditEvent is append-only by convention**, enforced today only by
  `packages/events` being the sole writer, not a DB trigger/permission
  grant. A hash-chain (`integrityHash`) makes tampering outside that path
  detectable. Revisit with a real DB-level `REVOKE UPDATE, DELETE` once
  there's a separate DB role for the app vs. migrations.

## Alternatives considered

- **Drizzle ORM** — comparable fit; Prisma chosen for team familiarity and
  mature migration tooling. Not a hard dependency of the domain layer
  (`packages/domain` has zero Prisma imports), so switching later is a
  `packages/db` + call-site change, not a rewrite.
- **UUID generated at the DB layer** (`gen_random_uuid()`) — rejected for
  now to avoid a Postgres extension dependency; revisit if bulk inserts
  bypassing the app layer become common.

## Consequences

Every model that's tenant- or client-scoped carries `organizationId`/
`clientId` directly (Section 27.1), so authorization filtering happens at
the query layer (see `apps/web/src/app/(app)/clients/page.tsx` and
`packages/auth`'s `requirePermission`), not as an application-layer
after-fetch filter.

## Migration/rollback

Schema changes always go through `prisma migrate dev --name <description>`
to produce a reviewable SQL migration file. Rolling back a bad migration
in production means writing and deploying a new migration that reverses
the change — Prisma does not support destructive automatic rollback, which
is the safer default for a system whose audit trail must stay intact.
