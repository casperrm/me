# ADR-001: Monorepo and primary application stack

- **Status:** Accepted
- **Date:** 2026-09-06

## Context

Bible Section 35 requires a TypeScript-first monorepo with specific app/package
boundaries (`/apps/web`, `/apps/api`, `/apps/worker`, `/packages/*`) and
PostgreSQL as the canonical database, while leaving exact framework choices
to bootstrap time.

## Decision

- **npm workspaces** for the monorepo tool — already available in this
  environment with no extra install, sufficient for our current package
  count. Revisit (pnpm/Turborepo) only if install times or cross-package
  caching become a real problem at higher package/app counts.
- **Next.js (App Router)** for `apps/web` — server components read the
  database directly, server actions and route handlers cover mutations, one
  deployable for team UI + (for now) most application logic.
- **Fastify** for `apps/api` — currently a thin health/readiness surface
  (see ADR-002 for why application logic isn't here yet).
- **BullMQ + Redis** for `apps/worker` — see ADR-004.
- **Prisma + PostgreSQL** for `packages/db` — see ADR-003.
- **Vitest** for unit tests across all packages.

## Alternatives considered

- **Separate repos per app/package** — rejected: Section 35 explicitly asks
  for a monorepo, and shared types (domain, auth policies) need to move
  across app boundaries without a publish step.
- **tRPC instead of REST route handlers** — deferred, not rejected: fine
  fit for `apps/web`'s own API routes later, but doesn't remove the need
  for a plain HTTP contract once `apps/api` serves non-Next clients
  (Client Portal, mobile, public API).

## Consequences

- Workspace packages (`@cedar/domain`, `@cedar/auth`, etc.) ship raw
  TypeScript source with no build step; consuming apps must transpile them
  (Next via `transpilePackages`, `apps/api`/`apps/worker` via `tsx` at
  runtime). This is intentionally deferred until there's a reason to add a
  real build pipeline (tsup/esbuild) for these packages — see the note in
  `apps/api/package.json`'s `start` script.
- A known Next.js + npm-workspaces build bug surfaced during Phase 0: **do
  not put `NODE_ENV` in the shared root `.env`.** Next's own build/start
  commands set `NODE_ENV` themselves; an explicit value inherited from a
  monorepo-wide `.env` (loaded via `dotenv-cli` before `next build`/`next
  start` run) breaks the App Router's production build in this npm
  workspaces layout (manifests as `next build` crashing while prerendering
  the framework's default `/404` and `/500` fallback pages with
  React-internals errors that have nothing to do with the actual page
  code — confirmed by bisection: the same `apps/web` source builds cleanly
  the moment it's copied outside the workspace, or the moment `NODE_ENV` is
  removed from the env file). `.env.example` and `packages/config`
  deliberately leave `NODE_ENV` out of the shared contract for this reason.

## Migration/rollback

Package manager and framework choices are swappable per app without
affecting the others, since each app has its own `package.json` and the
shared contracts between them (`packages/domain`, `packages/auth`, HTTP
where used) don't assume a specific framework.
