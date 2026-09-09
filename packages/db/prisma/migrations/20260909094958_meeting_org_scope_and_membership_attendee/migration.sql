/*
  Warnings:

  - You are about to drop the column `userId` on the `meeting_attendees` table. All the data in the column will be lost.
  - Added the required column `membershipId` to the `meeting_attendees` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `meetings` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "meeting_attendees" DROP CONSTRAINT "meeting_attendees_userId_fkey";

-- AlterTable
ALTER TABLE "meeting_attendees" DROP COLUMN "userId",
ADD COLUMN     "membershipId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "meetings_organizationId_idx" ON "meetings"("organizationId");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
