// Integration test for Section 18.2's retry + dead-letter handling —
// against a real Redis-backed BullMQ queue/worker (not a mock) and real
// Postgres, since the whole point is proving the actual failure-handling
// wiring apps/worker/src/index.ts uses, not a simulation of it.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@cedar/db";
import { recordJobFailureIfFinal } from "./dead-letter";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const TEST_QUEUE_NAME = `dead-letter-test-${Date.now()}`;

let connection: IORedis;
let queue: Queue;

async function wipeDatabase() {
  await prisma.workerJobFailure.deleteMany();
}

beforeAll(async () => {
  await wipeDatabase();
  connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  queue = new Queue(TEST_QUEUE_NAME, { connection });
});

afterEach(async () => {
  await wipeDatabase();
});

afterAll(async () => {
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
});

function runWorkerUntilDrained(handler: (attempt: number) => Promise<void>, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const worker = new Worker(
      TEST_QUEUE_NAME,
      async () => {
        attempt += 1;
        await handler(attempt);
      },
      { connection },
    );
    const timer = setTimeout(() => {
      worker.close().finally(() => reject(new Error("timed out waiting for job to settle")));
    }, timeoutMs);

    worker.on("failed", (job, err) => {
      void recordJobFailureIfFinal(TEST_QUEUE_NAME, job!, err).then(() => {
        // Only resolve after the dead-letter write completes and this was
        // truly the last attempt (BullMQ won't retry further).
        if (job!.attemptsMade >= (job!.opts.attempts ?? 1)) {
          clearTimeout(timer);
          worker.close().finally(resolve);
        }
      });
    });
    worker.on("completed", () => {
      clearTimeout(timer);
      worker.close().finally(resolve);
    });
  });
}

describe("recordJobFailureIfFinal against a real BullMQ worker", () => {
  it("does not persist a dead-letter row while retries remain", async () => {
    await queue.add("always-fails-once", {}, { attempts: 2, backoff: { type: "fixed", delay: 100 }, removeOnComplete: true, removeOnFail: true });

    await runWorkerUntilDrained(async (attempt) => {
      if (attempt === 1) throw new Error("transient failure");
      // second attempt succeeds
    });

    const failures = await prisma.workerJobFailure.findMany({ where: { queueName: TEST_QUEUE_NAME } });
    expect(failures).toHaveLength(0);
  });

  it("persists exactly one dead-letter row once every retry attempt is exhausted", async () => {
    await queue.add("always-fails", {}, { attempts: 2, backoff: { type: "fixed", delay: 100 }, removeOnComplete: true, removeOnFail: true });

    await runWorkerUntilDrained(async () => {
      throw new Error("permanent failure");
    });

    const failures = await prisma.workerJobFailure.findMany({ where: { queueName: TEST_QUEUE_NAME } });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      queueName: TEST_QUEUE_NAME,
      jobName: "always-fails",
      attemptsMade: 2,
      errorMessage: expect.stringContaining("permanent failure"),
    });
  });
});
