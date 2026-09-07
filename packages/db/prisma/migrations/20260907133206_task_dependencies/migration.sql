-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "blockedByTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_dependencies_taskId_idx" ON "task_dependencies"("taskId");

-- CreateIndex
CREATE INDEX "task_dependencies_blockedByTaskId_idx" ON "task_dependencies"("blockedByTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_taskId_blockedByTaskId_key" ON "task_dependencies"("taskId", "blockedByTaskId");

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blockedByTaskId_fkey" FOREIGN KEY ("blockedByTaskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
