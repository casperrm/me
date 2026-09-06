-- AlterTable
ALTER TABLE "brand_profile_versions" ADD COLUMN     "prohibitedLanguage" TEXT,
ADD COLUMN     "requiredDisclaimers" TEXT;

-- CreateTable
CREATE TABLE "quality_check_results" (
    "id" TEXT NOT NULL,
    "creativeVersionId" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "checks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_check_results_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "quality_check_results" ADD CONSTRAINT "quality_check_results_creativeVersionId_fkey" FOREIGN KEY ("creativeVersionId") REFERENCES "creative_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
