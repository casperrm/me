// Async jobs, AI, automation, sync, publishing (Bible Section 35, 25.1:
// "separate asynchronous workers for durable jobs/AI/integration
// workloads"). See docs/adr/0004-queue-and-outbox-strategy.md.
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "@cedar/config";
import { logger } from "@cedar/observability";
import { runEscalationScan } from "./jobs/escalations";

const env = loadEnv();

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const HEARTBEAT_QUEUE = "heartbeat";
const ESCALATIONS_QUEUE = "escalations";
const ESCALATION_INTERVAL_MS = 60 * 60 * 1000; // hourly

const heartbeatQueue = new Queue(HEARTBEAT_QUEUE, { connection });
const escalationsQueue = new Queue(ESCALATIONS_QUEUE, { connection });

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

for (const [name, worker] of [
  ["heartbeat", heartbeatWorker],
  ["escalations", escalationsWorker],
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
  logger.info("apps/worker started", { env: env.NODE_ENV, queues: [HEARTBEAT_QUEUE, ESCALATIONS_QUEUE] });
}

main().catch((err) => {
  logger.error("apps/worker failed to start", { error: String(err) });
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await heartbeatWorker.close();
  await escalationsWorker.close();
  await heartbeatQueue.close();
  await escalationsQueue.close();
  process.exit(0);
});
