# ADR-010: Deployment platform and observability stack

- **Status:** Proposed — not yet decided
- **Date:** 2026-09-06

## Context

Bible Section 31 requires local/CI/staging/production environments with
controlled promotion, and Section 31.3 requires structured logs, metrics,
and traces with correlation IDs.

## Decision (current, interim)

- **Observability:** `packages/observability`'s `logger` emits
  JSON-per-line structured logs with a `correlationId` field available on
  every call site — deliberately not a full framework (pino/winston/OTel)
  yet, since there's no log aggregation target configured to send them to.
  See the comment in `packages/observability/src/logger.ts`.
- **Deployment platform:** not chosen. `infra/` exists as a placeholder
  directory per Section 35's blueprint.

## What this ADR will need to decide

- Hosting target for `apps/web` (Next.js), `apps/api` (Fastify), and
  `apps/worker` (BullMQ) — options range from a single VM/container host
  running all three, to platform-specific split hosting (e.g., Next on
  Vercel + api/worker on a container platform), each with different
  implications for `DATABASE_URL`/`REDIS_URL` network reachability and for
  ADR-009's secrets approach.
- Log/metrics/trace aggregation target, which decides whether
  `packages/observability` grows into a real OpenTelemetry integration or
  stays a simple JSON-stdout logger shipped by the platform's own log
  collector.
- CI provider — this repo currently defines a CI workflow assuming GitHub
  Actions (`.github/workflows/ci.yml`); revisit if that's not the actual
  target.

## Consequences of deferring

`infra/` staying empty is a known, tracked gap — no staging deployment
exists yet, which means Phase 0's own stated deliverable ("staging
deployment," Section 36 Phase 0) is not yet met. Flagging this explicitly
rather than letting the empty directory silently imply otherwise.
