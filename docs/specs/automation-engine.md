# Workflow Automation Engine — v1 (real trigger/action primitive)

Bible reference: Section 18 ("Automation is event-driven and policy-
aware... Conditions filter execution; actions create/update records,
notify users, call AI, or invoke authorized connectors") and 18.2's
reliability requirements ("Every workflow run has status, step history,
input/output references, retry count, errors, and correlation ID...
Support pause, cancel, retry failed step, and safe replay.").

## The gap

`packages/automation` existed only as a placeholder — `export {};` with
a comment: "Workflow engine contracts... Not implemented yet." Nothing
in the Bible's Section 18 sense (a trigger/condition/action engine with
durable, inspectable run records) existed anywhere in the codebase.
Every scheduled job in `apps/worker` (escalations, health scores, AI
eval) was a bare async function: real automation in spirit (a schedule
triggers it, it checks conditions, it takes action), but with no shared
mechanism, no persisted run history beyond stdout logs, and — as this
slice found while migrating the first real consumer onto it — a real
bug in how one of those jobs handled a partial failure.

## What's built

- **`packages/automation`'s `runWorkflow()`** (`src/workflow.ts`): takes
  a `WorkflowDefinition` (a `key` plus an ordered list of named steps,
  each an async function) and a context value, runs every step in
  order, and persists exactly one `WorkflowRun` row per invocation —
  regardless of outcome, so a run is always visible afterward even if
  every step failed. Each step's result (`success`/`failed`,
  `startedAt`/`finishedAt`, its `output` or `error`) is recorded in the
  run's `steps` JSON column. The `correlationId` is picked up
  automatically from `@cedar/observability`'s ambient
  `AsyncLocalStorage` context (Section 31.3's mechanism, built in an
  earlier slice) — no separate ID to thread through by hand, since
  `apps/worker` already wraps each scheduled job handler in
  `runWithCorrelationId(job.id, ...)`.
- **Real step isolation, not just re-plumbing.** A step that throws is
  recorded as failed but does **not** stop the remaining steps from
  running. This is a genuine behavior fix, found while migrating the
  first consumer: `apps/worker/src/jobs/escalations.ts`'s
  `runEscalationScan` previously ran its four categories (tasks,
  projects, content, invoices) through a bare `Promise.all`. If any one
  category threw (say, a bad row surfaced a real Prisma error in the
  invoice scan), `Promise.all` rejected immediately — silently skipping
  the other three, completely unrelated categories for that entire
  run. Escalations that had nothing to do with the actual bug would go
  unrun until the next scheduled run, with nothing in the logs to make
  that obvious. Migrating this job onto `runWorkflow()` (each category
  as its own named step) fixes this for real: a broken category is
  recorded in that run's step history, and the healthy categories still
  run and still notify. `runEscalationScan` itself only rethrows (so
  BullMQ's retry/dead-letter handling still engages) when **every**
  category fails — a systemic problem, not a category-specific bug —
  see its own doc comment for the reasoning.
- **`/command/supervisor`'s "Automation runs" card**: the newest 10
  `WorkflowRun` rows, deployment-wide (same reasoning as the existing
  "Background job health" card for `WorkerJobFailure` — a scheduled job
  isn't tied to one tenant), showing each run's status and per-step
  success/failure, with the specific error text for any failed step.

## Scope — explicitly not built

This is a first real cut proving the mechanism works under genuine
production-shaped conditions, not the full Section 18 spec:

- **No generic trigger registry.** A "trigger" here is just "whatever
  caller decided to invoke `runWorkflow()`" — today, that's a BullMQ
  schedule, the same trigger source every other `apps/worker` job
  already uses. Section 18 also names webhooks, domain events, and
  approved manual commands as trigger types; building a registry that
  supports all of them before a second, different trigger source
  actually exists to prove the abstraction against would be
  speculative — the same reasoning `docs/adr/0002-modular-monolith-boundaries.md`
  already gives for why `packages/application` stays empty until a
  second real caller exists.
- **No rule-authoring UI.** Nobody can define a new workflow through
  the app — every `WorkflowDefinition` is still a literal object
  written in code (`escalations.ts`'s `escalationScanWorkflow`), the
  same way the job itself always was. A configurable rule builder is a
  substantially larger feature with no real user asking for it yet.
- **No step-level retries.** `WorkflowRun.retryCount` exists in the
  schema (per 18.2's own wording) but this first consumer never
  increments it — a step either succeeds or fails once per run. BullMQ's
  existing job-level retry (3 attempts, exponential backoff, from the
  worker-job-reliability slice) still applies to the *whole* job if
  `runEscalationScan` itself rethrows (the all-steps-failed case); nothing
  here retries one individual step in isolation. Building that needs a
  second real workflow with a concrete need for it.
- **No pause/cancel/replay.** 18.2 also asks for these; they need a
  durable resumption model (a step can be re-entered mid-run) this
  first cut doesn't have — every run here is fire-and-forget from start
  to its recorded finish.
- **Only one workflow migrated onto the engine.** The health-score and
  AI-eval jobs still run as before, unconverted. They're each a single
  logical operation already (no multi-category internal structure the
  way escalations has), so there's no comparable step-isolation bug to
  fix in them, and converting them wouldn't prove anything about the
  primitive that the escalations migration doesn't already prove.

## Testing

- `packages/automation/src/workflow.integration.test.ts` (new — this
  package's first-ever test file): 4 tests against real Postgres —
  a normal all-success run persists real step history; a failing step
  doesn't stop the remaining steps from running (the exact property a
  bare `Promise.all` doesn't have) and the run is recorded
  `completed_with_errors`; a run where every step fails is recorded
  `failed`; a real context value is correctly passed through to every
  step.
- `apps/worker/src/jobs/escalations.integration.test.ts` (extended):
  the existing "escalates one overdue..." test now also asserts a real
  `WorkflowRun` row exists with the right `workflowKey` and 4
  successful named steps. A new test simulates a failure confined to
  exactly the invoice category (via a `vi.mock` wrapper around the real
  `notifyClientWriters` that throws only for `invoice_overdue`) and
  proves the task category still ran and still notified despite it —
  the concrete regression test for the bug this migration fixes — plus
  asserts the run's step history shows the one real failure and three
  real successes.
- Live-verified against a real running `apps/worker` process: a real
  `WorkflowRun` row was produced with a real correlation ID matching
  the job's own log lines and correct per-step output (`{"escalated":
  1}` for the one real overdue invoice the dev seed data has). Then
  live-verified via a real headless-browser session that
  `/command/supervisor`'s new "Automation runs" card actually renders
  that run with the correct status and step count. All incidental rows
  (the `WorkflowRun`, a `ClientHealthScore`, an `AiEvalRun` and its
  results, a `Notification`) cleaned up afterward; confirmed the dev
  database was back to its seeded baseline.
