-- CreateTable
CREATE TABLE "video_briefs" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_brief_versions" (
    "id" TEXT NOT NULL,
    "videoBriefId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "concept" TEXT,
    "hook" TEXT,
    "storyboardNotes" TEXT,
    "script" TEXT,
    "voiceoverCopy" TEXT,
    "captionCopy" TEXT,
    "editInstructions" TEXT,
    "musicNotes" TEXT,
    "platformVariants" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "video_brief_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shoots" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "scheduledAt" TIMESTAMP(3),
    "location" TEXT,
    "crew" TEXT,
    "equipment" TEXT,
    "permits" TEXT,
    "callSheetNotes" TEXT,
    "shotList" TEXT,
    "productList" TEXT,
    "references" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shoots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_briefs_creativeId_key" ON "video_briefs"("creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "video_brief_versions_videoBriefId_version_key" ON "video_brief_versions"("videoBriefId", "version");

-- CreateIndex
CREATE INDEX "shoots_clientId_idx" ON "shoots"("clientId");

-- AddForeignKey
ALTER TABLE "video_briefs" ADD CONSTRAINT "video_briefs_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "creatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_brief_versions" ADD CONSTRAINT "video_brief_versions_videoBriefId_fkey" FOREIGN KEY ("videoBriefId") REFERENCES "video_briefs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoots" ADD CONSTRAINT "shoots_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoots" ADD CONSTRAINT "shoots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
