-- Section 27.1: "created_at, updated_at... where meaningful" — Task,
-- Creative, and Meeting are genuinely mutated in place, previously with
-- no way to know when. Existing rows backfilled to now() at migration
-- time (their real prior update time isn't recoverable); every row
-- created or updated from this point forward gets a real value via
-- Prisma's @updatedAt.
-- AlterTable
ALTER TABLE "creatives" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
