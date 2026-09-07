-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "taskId" TEXT;

-- CreateIndex
CREATE INDEX "assets_taskId_idx" ON "assets"("taskId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
