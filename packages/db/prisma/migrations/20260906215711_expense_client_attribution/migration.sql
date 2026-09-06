-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE INDEX "expenses_clientId_idx" ON "expenses"("clientId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
