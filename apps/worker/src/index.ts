// Async jobs, AI, automation, sync, publishing (Bible Section 35, 25.1:
// "separate asynchronous workers for durable jobs/AI/integration
// workloads"). See docs/adr/0004-queue-and-outbox-strategy.md.
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "@cedar/config";
import { logger } from "@cedar/observability";
import { runEscalationScan } from "./jobs/escalations";
import { runHealthScoreJob } from "./jobs/health-scores";
import { runAiEvalJob } from "./jobs/ai-eval";

const env = loadEnv();

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const HEARTBEAT_QUEUE = "heartbeat";
const ESCALATIONS_QUEUE = "escalations";
const HEALTH_SCORES_QUEUE = "health-scores";
const AI_EVAL_QUEUE = "ai-eval";
const ESCALATION_INTERVAL_MS = 60 * 60 * 1000; // hourly
const HEALTH_SCORE_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
// daily — a routing-logic regression is a slow-moving code-change risk,
// not something needing hourly checks like the escalation scan.
const AI_EVAL_INTERVAL_MS = 24 * 60 * 60 * 1000;

const heartbeatQueue = new Queue(HEARTBEAT_QUEUE, { connection });
const escalationsQueue = new Queue(ESCALATIONS_QUEUE, { connection });
const healthScoresQueue = new Queue(HEALTH_SCORES_QUEUE, { connection });
const aiEvalQueue = new Queue(AI_EVAL_QUEUE, { connection });

const heartbeatWorker = new Worker(
  HEARTBEAT_QUEUE,
  async (job) => {
    logger.debug("heartbeat", { jobId: job.id });
  },
  { connection },
);

// Section 30: overdue tasks/projects/content calendar items get a
// deduplicated escalation notification (packages/events'
// notifyClientWriters) — this is apps/worker's first real job, closing
// the Phase 0 gap noted in ROADMAP.md ("carries no real job yet").
const escalationsWorker = new Worker(
  ESCALATIONS_QUEUE,
  async (job) => {
    const count = await runEscalationScan();
    logger.info("escalation job finished", { jobId: job.id, resourcesEscalated: count });
  },
  { connection },
);

// Section 4.2: recomputes an explainable Client Health Score for every
// client daily — see jobs/health-scores.ts for exactly which signals are
// real vs. explicitly out of scope.
const healthScoresWorker = new Worker(
  HEALTH_SCORES_QUEUE,
  async (job) => {
    const count = await runHealthScoreJob();
    logger.info("health score job finished", { jobId: job.id, clientsScored: count });
  },
  { connection },
);

// Section 6.3/33: a real, deterministic regression suite for Cedar
// Brain's routing logic, run daily instead of only on demand from
// /command/supervisor's "Run eval now" button — see
// docs/specs/ai-eval-harness.md's scope-boundary update and
// jobs/ai-eval.ts for exactly what runs.
const aiEvalWorker = new Worker(
  AI_EVAL_QUEUE,
  async (job) => {
    const run = await runAiEvalJob();
    logger.info("ai eval job finished", { jobId: job.id, totalCases: run.totalCases, passedCases: run.passedCases });
  },
  { connection },
);

for (const [name, worker] of [
  ["heartbeat", heartbeatWorker],
  ["escalations", escalationsWorker],
  ["health-scores", healthScoresWorker],
  ["ai-eval", aiEvalWorker],
] as const) {
  worker.on("failed", (job, err) => {
    logger.error(`${name} job failed`, { jobId: job?.id, error: String(err) });
  });
}

async function main() {
  await heartbeatQueue.add("tick", {}, { repeat: { every: 60_000 }, removeOnComplete: 10, removeOnFail: 10 });
  await escalationsQueue.add(
    "scan",
    {},
    // `immediately: true` runs one scan right away on every worker start
    // (not just on the hourly cadence) — a restart shouldn't leave
    // already-overdue items waiting up to an hour for their first check.
    { repeat: { every: ESCALATION_INTERVAL_MS, immediately: true }, removeOnComplete: 10, removeOnFail: 10 },
  );
  await healthScoresQueue.add(
    "score",
    {},
    { repeat: { every: HEALTH_SCORE_INTERVAL_MS, immediately: true }, removeOnComplete: 10, removeOnFail: 10 },
  );
  await aiEvalQueue.add(
    "eval",
    {},
    // `immediately: true` for the same reason as the other scheduled
    // jobs: a restart shouldn't leave a routing regression uncaught for
    // up to a day waiting on the next scheduled run.
    { repeat: { every: AI_EVAL_INTERVAL_MS, immediately: true }, removeOnComplete: 10, removeOnFail: 10 },
  );
  logger.info("apps/worker started", {
    env: env.NODE_ENV,
    queues: [HEARTBEAT_QUEUE, ESCALATIONS_QUEUE, HEALTH_SCORES_QUEUE, AI_EVAL_QUEUE],
  });
}

main().catch((err) => {
  logger.error("apps/worker failed to start", { error: String(err) });
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await heartbeatWorker.close();
  await escalationsWorker.close();
  await healthScoresWorker.close();
  await aiEvalWorker.close();
  await heartbeatQueue.close();
  await escalationsQueue.close();
  await healthScoresQueue.close();
  await aiEvalQueue.close();
  process.exit(0);
});
