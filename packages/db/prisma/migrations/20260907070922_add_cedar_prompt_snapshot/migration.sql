-- CreateTable
CREATE TABLE "cedar_prompt_snapshots" (
    "id" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cedar_prompt_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cedar_prompt_snapshots_promptVersion_key" ON "cedar_prompt_snapshots"("promptVersion");
