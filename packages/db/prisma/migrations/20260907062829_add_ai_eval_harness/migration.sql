-- CreateTable
CREATE TABLE "ai_eval_runs" (
    "id" TEXT NOT NULL,
    "suite" TEXT NOT NULL,
    "totalCases" INTEGER NOT NULL,
    "passedCases" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_eval_results" (
    "id" TEXT NOT NULL,
    "evalRunId" TEXT NOT NULL,
    "caseName" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,

    CONSTRAINT "ai_eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_eval_runs_suite_createdAt_idx" ON "ai_eval_runs"("suite", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_eval_results" ADD CONSTRAINT "ai_eval_results_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "ai_eval_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
