-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "correlationId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_runs_workflowKey_startedAt_idx" ON "workflow_runs"("workflowKey", "startedAt");
