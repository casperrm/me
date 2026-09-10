# ADR-004: Queue / outbox / event delivery strategy

- **Status:** Accepted (interim) — expected to evolve, see Consequences
- **Date:** 2026-09-06
- **Updated:** 2026-09-09 — the "rate limiting" prediction in Alternatives
  considered below is now real: `apps/web` opens its own Redis connection
  (`packages/auth/src/rate-limit.ts`) for a fixed-window limiter on
  `POST /api/auth/login` and the public webhook receiver (Section 23.1).
  This is `apps/web`'s first direct Redis use — previously only
  `apps/worker`'s BullMQ queues touched Redis. See
  `docs/specs/rate-limiting.md`.
- **Updated:** 2026-09-10 — closed a real Section 18.2 gap: every
  scheduled job had zero retry configuration (BullMQ's default is a
  single attempt) and a failure only ever reached `logger.error`, with
  nothing persisted once BullMQ's own `removeOnFail: 10` cap rolled a
  record off. Added `attempts: 3` + exponential backoff to each
  scheduled job and a new `WorkerJobFailure` dead-letter record,
  persisted only once every retry attempt is exhausted. See
  `docs/specs/worker-job-reliability.md`.

## Context

Bible Section 26 asks for domain events with an outbox pattern (events
published only after the originating transaction commits) and Section
18.2 requires durable async workflow execution with retries and dead-letter
handling. Phase 0 has no workflows yet, but `apps/worker` needs a real
runtime to exist as a boundary (Section 35) rather than an empty folder.

## Decision

- **Redis + BullMQ** for the queue, chosen because Redis is already a
  reasonable dependency for future caching/rate-limiting (Section 23.1)
  and BullMQ gives retries, delayed jobs, and repeatable jobs without
  standing up a heavier broker.
- `apps/worker` currently runs one trivial repeatable "heartbeat" job —
  proving the connection and process boundary, not real work. The first
  real job (publishing, sync, AI orchestration) should follow this same
  pattern: a `Queue` producer (called from `apps/web` or `apps/api`) and a
  `Worker` consumer in `apps/worker`.
- **No outbox table yet.** `packages/events`' `emitAuditEvent` writes
  directly in the same request as the triggering mutation, not inside a
  transactional outbox — acceptable today because nothing yet needs
  cross-service event delivery (everything is one Postgres transaction
  away). The outbox pattern becomes necessary the moment a queue job needs
  to be enqueued atomically with a DB write (e.g., "create invoice, then
  reliably enqueue a reminder job" — a naive two-step risks the enqueue
  succeeding/failing independently of the commit).

## Alternatives considered

- **Postgres-backed queue (e.g., `graphile-worker`, `pg-boss`)** — avoids
  a second infra dependency (no Redis) and gets transactional enqueue
  "for free" via the same DB transaction. Worth revisiting once real job
  volume exists; Redis/BullMQ chosen now for the wider ecosystem and
  because Redis will likely be needed anyway (caching, rate limiting).
- **SQS/cloud-managed queue** — deferred until a concrete deployment
  target is chosen (Section 41's ADR-010 territory).

## Consequences

Until the outbox pattern lands, any code that needs "commit this DB write
and enqueue a job, atomically" must not exist yet — check for that pattern
before adding a new workflow, and implement the outbox table + a small
poller/publisher at that point rather than faking atomicity with a
best-effort double-write.

## Migration/rollback

Swapping BullMQ/Redis for a Postgres-backed queue means rewriting
`apps/worker`'s producer/consumer calls; no domain model changes required
since nothing outside `apps/worker` and its callers knows which queue
technology is in use.
