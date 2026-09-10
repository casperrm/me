-- CreateTable
CREATE TABLE "worker_job_failures" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "attemptsMade" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_job_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_job_failures_queueName_occurredAt_idx" ON "worker_job_failures"("queueName", "occurredAt");
