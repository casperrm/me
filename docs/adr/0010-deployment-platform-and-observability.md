# ADR-010: Deployment platform and observability stack

- **Status:** Proposed — not yet decided
- **Date:** 2026-09-06
- **Updated:** 2026-09-10 — the `correlationId` field this ADR described
  as "available on every call site" is now actually populated, not just
  a typed hook: `packages/observability/src/correlation.ts`
  (`AsyncLocalStorage`-based) threads a real ID through every log line
  from one `apps/worker` scheduled job run. See
  `docs/specs/worker-log-correlation.md` for the design and its
  explicitly-deferred sibling gap (per-HTTP-request correlation IDs
  across `apps/web`'s ~61 API routes — a larger, separate follow-up).

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
