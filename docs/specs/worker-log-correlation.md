# Correlation IDs for worker job logs

Bible reference: Section 31.3 (Observability) — "Structured logs with
correlation/request/workflow/agent IDs."

## The gap

`packages/observability`'s `logger` already had a typed
`correlationId` field on its `LogContext` interface, and
`docs/adr/0010-deployment-platform-and-observability.md` described it as
"available on every call site" — accurate as far as it went, but nothing
anywhere in `apps/*` ever actually populated it (confirmed by grepping
for real usage before writing this: zero). The field was a hook, not a
working mechanism — structurally identical to a mistake caught and
avoided in a separate slice this session (`Invoice.currency`, a real
schema field nothing ever reads).

Without a real correlation ID, debugging one specific job run in
production log output means grepping by approximate timestamp and hoping
nothing else logged in the same window — there was no way to isolate
"every log line this one execution produced."

## What's built

- **`packages/observability/src/correlation.ts`**:
  `runWithCorrelationId(id, fn)` / `getCorrelationId()`, built on Node's
  built-in `AsyncLocalStorage` — no new dependency. This is the only
  mechanism that actually threads an ID through an async call chain
  several layers deep (a job handler calling a service function calling
  another) without every function signature in between needing an extra
  parameter just to carry it along.
- **`logger.ts`** now auto-merges the ambient correlation ID (from
  `getCorrelationId()`) into every log line, unless the caller passes an
  explicit `correlationId` in their own context (which always wins).
  Every existing `logger.info`/`logger.error` call site in
  `apps/worker/src/jobs/*.ts` needed zero code changes to start being
  correlated — they already ran inside the call graph this wraps.
- **`apps/worker/src/index.ts`**: each of the three real scheduled job
  handlers (escalations, health scores, AI eval) now runs inside
  `runWithCorrelationId(job.id, ...)`. Reuses BullMQ's own
  already-unique per-execution `job.id` as the correlation ID rather than
  minting a separate random UUID — one real identifier instead of two
  redundant ones, and it's the same value the existing "job failed" log
  line and `WorkerJobFailure` dead-letter record
  (`docs/specs/worker-job-reliability.md`) already reference as `jobId`.
  The `worker.on("failed", ...)` handler re-establishes the same
  correlation id explicitly, since BullMQ fires that as a separate
  event-listener invocation, not a continuation of the job handler's own
  async call stack — the ambient context from inside the handler doesn't
  reach it automatically.
- `heartbeat` deliberately left uncorrelated — a trivial debug tick that
  never throws and produces one log line, not a multi-step workflow
  worth tracing.

## Scope — explicitly deferred, not forgotten

**API-route-level correlation IDs (a per-HTTP-request ID) are not built
here.** That would mean touching all ~61 route handlers in `apps/web` to
establish a correlation context at the top of each one — a much larger,
separate, mechanical change than this slice, and Next.js's middleware
can't establish it on the route handler's behalf (middleware and the
route handler that follows it run as separate function invocations, not
a shared JS call stack, so `AsyncLocalStorage` state set in middleware
never reaches the handler). Worker job logs were the highest-value,
most tightly-scoped place to start: a bounded "workflow" unit (Section
31.3's own word) with existing multi-line logging and no way to tie
those lines together before this.

Also not built: distributed tracing (Section 31.3's separate "traces"
requirement — needs a real tracing backend/OTel, out of scope for the
same reason the observability ADR gives for not adopting a full logging
framework yet), and propagating a correlation ID into `WorkerJobFailure`
rows themselves (the dead-letter table) — the log line already carries
it under the same value as `jobId`, which is sufficient to cross-
reference; adding a redundant column wasn't judged worth a new migration
for this slice.

## Testing

- `packages/observability/src/correlation.test.ts` — this package's
  first-ever test file (confirmed via `find` before writing: zero tests
  existed). 8 tests: the ID is absent outside any context; available
  only for the duration of `runWithCorrelationId`'s callback; survives
  through nested async calls several layers deep (the actual property
  that makes `AsyncLocalStorage` worth using over a plain module
  variable); does not leak between two concurrent, interleaved runs
  (`Promise.all` of two differently-timed tracked runs, each asserting
  its own ID); the logger auto-tags log lines with the ambient ID;
  omits it entirely outside any context; an explicit per-call
  `correlationId` overrides the ambient one; a log line from a genuinely
  nested async call gets tagged correctly.
- Live-verified against a real running `apps/worker` process: real log
  output showed `"ai eval job complete"` (logged from inside
  `runAiEvalJob()`, a nested call) and `"ai eval job finished"` (logged
  from the wrapper in `index.ts`) sharing the exact same real
  `correlationId`; the same pattern held for the escalation scan and
  health-score job, each with a different, real BullMQ job ID as its
  correlation ID — proving no cross-contamination between different job
  types running in the same process. All incidental rows the worker
  restart produced (a real overdue-invoice notification, an `AiEvalRun`
  and its results, a `ClientHealthScore`) were cleaned up afterward,
  confirmed no worker process left running.
