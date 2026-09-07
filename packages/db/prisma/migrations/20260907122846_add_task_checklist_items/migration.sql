-- CreateTable
CREATE TABLE "task_checklist_items" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_checklist_items_taskId_idx" ON "task_checklist_items"("taskId");

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
