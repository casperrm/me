/*
  Warnings:

  - Added the required column `latencyMs` to the `cedar_brain_requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mode` to the `cedar_brain_requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `promptVersion` to the `cedar_brain_requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `success` to the `cedar_brain_requests` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "cedar_brain_requests" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "flaggedByMembershipId" TEXT,
ADD COLUMN     "flaggedIncorrect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "latencyMs" INTEGER NOT NULL,
ADD COLUMN     "mode" TEXT NOT NULL,
ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "promptVersion" TEXT NOT NULL,
ADD COLUMN     "success" BOOLEAN NOT NULL;

-- CreateIndex
CREATE INDEX "cedar_brain_requests_organizationId_createdAt_idx" ON "cedar_brain_requests"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "cedar_brain_requests" ADD CONSTRAINT "cedar_brain_requests_flaggedByMembershipId_fkey" FOREIGN KEY ("flaggedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
