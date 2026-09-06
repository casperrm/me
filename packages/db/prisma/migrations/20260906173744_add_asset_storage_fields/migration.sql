/*
  Warnings:

  - You are about to drop the column `url` on the `assets` table. All the data in the column will be lost.
  - Added the required column `organizationId` to the `assets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storageKey` to the `assets` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "assets" DROP COLUMN "url",
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "storageKey" TEXT NOT NULL,
ADD COLUMN     "uploadedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "assets_organizationId_idx" ON "assets"("organizationId");

-- CreateIndex
CREATE INDEX "assets_clientId_idx" ON "assets"("clientId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
