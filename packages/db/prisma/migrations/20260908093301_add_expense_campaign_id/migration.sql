-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "expenses_campaignId_idx" ON "expenses"("campaignId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
