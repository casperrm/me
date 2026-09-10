# Worker job reliability: retries + dead-letter handling

Bible reference: Section 18.2 — "durable job execution with retries and
dead-letter handling." Also relevant to Phase 7's "operational SLOs,"
though this slice is deliberately narrower than that (see Scope below).

## What existed before this slice

`apps/worker`'s four scheduled jobs (heartbeat, escalations, health
scores, the AI eval harness — see `docs/specs/notifications.md`,
`docs/specs/client-health.md`, `docs/specs/ai-eval-harness.md`) had no
retry configuration at all — BullMQ's default is a single attempt — and
a failure only ever reached `logger.error` (stdout/stderr). BullMQ keeps
up to 10 recent failed jobs in Redis (`removeOnFail: 10`), but nothing in
the application ever read that set, so once the 11th failure rolled the
oldest one off, evidence of it was gone. In a real deployment with no one
watching raw process logs, a scheduled job could silently stop working
indefinitely.

## What's built

- **Retries.** Every scheduled job (escalations, health scores, AI eval)
  now gets `attempts: 3` with exponential backoff starting at 5 seconds
  (`JOB_RETRY_OPTS` in `apps/worker/src/index.ts`). `heartbeat` is
  deliberately left without retry config — it's a trivial debug tick
  that never throws, not a business-meaningful job worth the same
  treatment.
- **Dead-letter record.** A new `WorkerJobFailure` model
  (`queueName`, `jobName`, `errorMessage`, `attemptsMade`, `occurredAt`)
  — deployment-wide like `AiEvalRun`, not tenant data, since a scheduled
  job isn't tied to one organization.
- **`apps/worker/src/dead-letter.ts`**: `isFinalAttempt(job)` and
  `recordJobFailureIfFinal(queueName, job, err)`, extracted out of
  `index.ts` specifically so this logic has direct test coverage —
  `index.ts` self-executes its `main()` on import (it's the actual
  process entry point), so it can't itself be imported and exercised in
  a test without booting a real worker. A record is only persisted once
  `attemptsMade >= opts.attempts` — a mid-retry failure isn't "dead," a
  record for every individual attempt would misrepresent a job that
  later succeeded as permanently failed.
- **Visibility**: `listRecentWorkerJobFailures()`
  (`apps/web/src/lib/services/ai-supervisor-service.ts`) and a new
  "Background job health" card on `/command/supervisor`, gated the same
  as the rest of that page (`ai:supervise`) — reused rather than
  inventing a new permission, since every job this covers is already
  AI/business-operational territory that page's audience reviews, and
  this app has no separate general system-health surface to justify a
  new one for.

## Scope — what this deliberately does not do

- **Not a retry mechanism inside any one job's own logic** — `attempts`
  re-runs the whole job function from scratch (e.g. all of
  `runEscalationScan()` again), not a partial-progress resume. For these
  jobs (idempotent scans, deduped by `hasRecentNotification`/health-score
  history) that's the correct, simplest behavior — a partial-resume
  mechanism would be solving a problem these particular jobs don't have.
- **Not alerting/paging.** A dead-letter row is visible on
  `/command/supervisor` for a human who checks it; nothing pages anyone
  automatically. Real alerting (email/Slack/PagerDuty) needs a real
  outbound-notification channel this system doesn't have — Section 30's
  in-app `Notification` model is tenant-scoped and doesn't fit a
  deployment-wide operational signal like this.
- **Not the "operational SLOs" item from Phase 7** — that's a much
  larger unstarted body of work (uptime targets, response-time
  budgets, on-call processes). This slice closes one concrete,
  Bible-named sub-requirement (Section 18.2's retries + dead-letter),
  not the whole Phase 7 line.
- **Not a retry/replay UI.** A human reading the dead-letter list can't
  re-trigger the failed job from this page — the existing "Run eval now"
  button already covers manual re-runs for the one job that has one; the
  others already re-run automatically at their next scheduled interval.

## Testing

- `apps/worker/src/dead-letter.integration.test.ts` — against a real,
  throwaway BullMQ queue/worker on real Redis (not a mock, since the
  entire point is proving the actual retry/failure-event wiring
  `index.ts` uses): a job that fails once then succeeds never gets a
  dead-letter row; a job that fails on every attempt gets exactly one
  row, with the real error message and attempt count.
- `apps/web/src/lib/services/ai-supervisor.integration.test.ts` — 2 new
  tests for `listRecentWorkerJobFailures`: real rows returned newest
  first, deployment-wide; the `limit` parameter is respected.
- Live-verified: started the real `apps/worker` process and confirmed
  clean startup with the new retry options (no regression — all four
  jobs still ran and completed normally). Inserted one representative
  dead-letter row via `psql` (proving the mechanism itself was already
  covered end-to-end by the integration test above, this step verifies
  the UI renders real data correctly) and confirmed via a real headless-
  Chromium screenshot that `/command/supervisor`'s new "Background job
  health" card shows the queue/job name, attempt count, and error
  message. Cleaned up: deleted the smoke-test dead-letter row and the
  incidental `AiEvalRun`/`AiEvalResult`/`ClientHealthScore` rows the
  worker restart's own `immediately: true` scheduling produced (matching
  this project's established precedent from the AI-eval-scheduling
  slice), confirmed no server or worker process left running.
