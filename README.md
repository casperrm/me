# Cedar Point OS

An AI-native operating system for Cedar Point Media — one place for clients,
projects, advertising, content, design, video, employees, finances, files,
approvals, reporting, automation, and AI. Not a website. Not a generic CRM.

**[`docs/CEDAR_POINT_OS_BIBLE.md`](./docs/CEDAR_POINT_OS_BIBLE.md) is the
single authoritative specification** for what this system is and how it
should be built (`VISION.md` is the earlier informal draft, kept for
history only — the Bible supersedes it). [`ARCHITECTURE.md`](./ARCHITECTURE.md)
explains how this codebase implements the Bible's Section 35 repository
blueprint, and [`ROADMAP.md`](./ROADMAP.md) tracks progress against its
Section 36 phases.

## What exists right now (Phase 0 + early Phase 1)

Building the whole Bible in one pass isn't realistic — Phase 0's own
deliverable is deliberately narrow: **secure owner login, invite-only
membership, role assignment, audit trail, health endpoints.** That's what's
here, plus a working slice of Phase 1 (Client Management) built on top of
it:

- **Identity & Access** (`packages/domain`, `packages/auth`,
  `packages/events`) — RBAC with per-client scoped grants, server-side
  authorization on every protected read/write, an append-only audit log
  with a tamper-evidence hash chain. See `docs/specs/identity-access.md`
  and `docs/adr/0006-authentication-and-authorization.md`.
- **Data model** (`packages/db/prisma/schema.prisma`, PostgreSQL) —
  Organization/User/Membership/Invitation/Session/ScopedGrant/AuditEvent,
  plus Client/BrandProfile(versioned)/Project/Campaign/Creative+Approvals/
  Invoice/Expense/Meeting/CedarBrainRequest.
- **apps/web** (Next.js) — `/setup` (one-time owner bootstrap), `/login`,
  `/invite/[token]`, `/team` (invite/role/revoke/scope management),
  `/dashboard` (CEO Dashboard, gated on `finance:read`), `/clients` +
  `/clients/[id]` (client-isolation enforced at the query layer, not just
  the UI), `/command` (Cedar Command Center — routes a prompt to Cedar
  Brain agents; real responses if `ANTHROPIC_API_KEY` is set, a
  deterministic stub otherwise).
- **apps/api**, **apps/worker** — thin health/readiness surfaces proving
  the process boundaries exist (Section 35); no real workload yet, see
  `docs/adr/0002-modular-monolith-boundaries.md` and
  `docs/adr/0004-queue-and-outbox-strategy.md`.

Everything else — Brand DNA's full richness, Creative/Video Studios, ad
platform integrations, Finance Hub, the Knowledge Graph, Cedar
Intelligence, etc. — is scoped in `ROADMAP.md` but not yet built. Check
that file, and the module specs under `docs/specs/`, before assuming a
Bible section is implemented.

## Getting started

Requires PostgreSQL and Redis running locally (or reachable via
`DATABASE_URL`/`REDIS_URL`).

```bash
cp .env.example .env          # fill in DATABASE_URL / REDIS_URL / SESSION_SECRET
npm install                   # installs all workspaces
npm run db:migrate:deploy     # applies migrations
npm run db:seed               # demo org "Cedar Point Media" + client "Volt Mobile"
npm run dev                   # apps/web on http://localhost:3000
```

The seed prints a dev-only owner login (email `consultingcedarpoint@gmail.com`,
password shown in the seed script's own output). In a fresh unsedded
database, visiting the app for the first time routes you to `/setup` to
create the first organization/owner instead — everyone after that joins by
invitation from `/team` (Bible Section 29: invite-only access).

To run `apps/api` or `apps/worker` locally: `npm run dev --workspace apps/api`
/ `apps/worker`.

To get real Cedar Brain responses in the Command Center instead of the
stub, set `ANTHROPIC_API_KEY` in `.env`.

## Repository layout

Follows the Bible's Section 35 blueprint:

```
/apps/web          Next.js team application (current home of most use-case logic)
/apps/api          Fastify — health/readiness today; grows when a second caller needs HTTP
/apps/worker       BullMQ/Redis — process boundary proven, no real jobs yet
/packages/domain   Pure RBAC policy (no I/O, no framework deps)
/packages/auth     Sessions, passwords, invitations, authorization glue to the DB
/packages/db       Prisma schema, migrations, seed
/packages/events   Append-only audit event emission
/packages/config   Typed env validation shared by every app
/packages/observability  Structured logging
/packages/{application,ai,connectors,automation,ui}  Boundaries reserved for later phases
/docs/adr          Architecture Decision Records
/docs/specs        Per-module specs (purpose, entities, permissions, events, failure modes)
```

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + Prisma + PostgreSQL +
Redis/BullMQ. See `docs/adr/0001-monorepo-and-stack.md` for why, including
a documented npm-workspaces + Next.js build quirk worth knowing before
touching the root `.env` file.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, a migration
dry-run against a real Postgres service container, the `apps/web`
production build, and a dependency audit — the Bible's Section 31.2 gates.
