-- CreateTable
CREATE TABLE "agency_memory_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceMeetingId" TEXT NOT NULL,
    "sourceDecisionId" TEXT NOT NULL,
    "clientId" TEXT,
    "promotedByMembershipId" TEXT NOT NULL,
    "promotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agency_memory_entries_organizationId_promotedAt_idx" ON "agency_memory_entries"("organizationId", "promotedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agency_memory_entries_sourceMeetingId_sourceDecisionId_key" ON "agency_memory_entries"("sourceMeetingId", "sourceDecisionId");
