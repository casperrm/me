import type { Job } from "bullmq";
import { prisma } from "@cedar/db";
import { logger } from "@cedar/observability";

// Section 18.2's dead-letter handling. Extracted out of index.ts (which
// self-executes on import via its top-level main().catch(...), and so
// can't itself be imported for testing without booting a real worker)
// so this logic has direct test coverage — see dead-letter.integration.test.ts.

/** True once a job has used up every configured retry attempt. */
export function isFinalAttempt(job: Job): boolean {
  const attemptsMade = job.attemptsMade ?? 1;
  const maxAttempts = job.opts.attempts ?? 1;
  return attemptsMade >= maxAttempts;
}

/**
 * Persists a dead-letter record only on the final failed attempt — a
 * mid-retry failure is expected to recover on its own, and a record for
 * every individual attempt would misrepresent a job that later succeeded
 * as permanently dead.
 */
export async function recordJobFailureIfFinal(queueName: string, job: Job, err: Error): Promise<void> {
  if (!isFinalAttempt(job)) return;

  try {
    await prisma.workerJobFailure.create({
      data: { queueName, jobName: job.name, errorMessage: String(err), attemptsMade: job.attemptsMade ?? 1 },
    });
  } catch (persistErr) {
    logger.error("failed to persist dead-letter record", { error: String(persistErr) });
  }
}
