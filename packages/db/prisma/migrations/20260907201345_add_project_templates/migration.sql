-- CreateTable
CREATE TABLE "project_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_template_tasks" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_template_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_templates_organizationId_idx" ON "project_templates"("organizationId");

-- CreateIndex
CREATE INDEX "project_template_tasks_templateId_idx" ON "project_template_tasks"("templateId");

-- AddForeignKey
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_template_tasks" ADD CONSTRAINT "project_template_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "project_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
