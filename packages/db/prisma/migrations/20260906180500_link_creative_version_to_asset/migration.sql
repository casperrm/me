-- AddForeignKey
ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
