-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "clientId" TEXT;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
