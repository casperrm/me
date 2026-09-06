// Async jobs, AI, automation, sync, publishing (Bible Section 35, 25.1:
// "separate asynchronous workers for durable jobs/AI/integration
// workloads"). Phase 0 only proves the runtime exists and is wired to
// Redis — a real job (publishing, sync, AI orchestration) lands with the
// phase that needs it (Section 18, 8, 6 respectively). See
// docs/adr/0004-queue-and-outbox-strategy.md.
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "@cedar/config";
import { logger } from "@cedar/observability";

const env = loadEnv();

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const HEARTBEAT_QUEUE = "heartbeat";

const heartbeatQueue = new Queue(HEARTBEAT_QUEUE, { connection });

const worker = new Worker(
  HEARTBEAT_QUEUE,
  async (job) => {
    logger.debug("heartbeat", { jobId: job.id });
  },
  { connection },
);

worker.on("failed", (job, err) => {
  logger.error("heartbeat job failed", { jobId: job?.id, error: String(err) });
});

async function main() {
  await heartbeatQueue.add(
    "tick",
    {},
    { repeat: { every: 60_000 }, removeOnComplete: 10, removeOnFail: 10 },
  );
  logger.info("apps/worker started", { env: env.NODE_ENV, queue: HEARTBEAT_QUEUE });
}

main().catch((err) => {
  logger.error("apps/worker failed to start", { error: String(err) });
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await heartbeatQueue.close();
  process.exit(0);
});
