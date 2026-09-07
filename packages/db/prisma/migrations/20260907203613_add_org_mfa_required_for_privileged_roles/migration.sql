-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "mfaRequiredForPrivilegedRoles" BOOLEAN NOT NULL DEFAULT false;
