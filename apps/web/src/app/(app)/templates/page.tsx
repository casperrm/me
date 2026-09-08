import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { checkPermission } from "@/lib/guards";
import { listProjectTemplatesForManagement } from "@/lib/services/project-template-service";
import { TemplateRenameForm } from "./TemplateRenameForm";
import { TemplateDeleteButton } from "./TemplateDeleteButton";
import { TemplateTasks } from "./TemplateTasks";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  // Template editing (docs/specs/projects-and-calendar.md) — a dedicated
  // template-management surface isn't tied to any one client, so it's
  // gated the same org-wide way as the writes it exposes: `clients:write`
  // with no clientId, restricting this to OWNER, ADMIN, or an explicit
  // org-wide ScopedGrant. Not organization:manage — that tier is reserved
  // for org security/infra settings, not day-to-day PM artifacts.
  const { allowed, actor } = await checkPermission("clients:write");
  if (!allowed || !actor) {
    return (
      <PermissionDenied message="Managing the shared template library requires clients:write organization-wide. Ask an owner or admin." />
    );
  }

  const templates = await listProjectTemplatesForManagement({
    actorUserId: actor.user.id,
    organizationId: actor.organizationId,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Project Templates</h1>
        <p className="text-sm text-neutral-500">
          Reusable task lists any client&apos;s projects can be instantiated from. Rename, delete, or add/remove a
          task here — there&apos;s no reordering (removing and re-adding a task is the escape hatch, matching how
          task checklist items work).
        </p>
      </div>

      {templates.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">
            No templates yet. Save a project&apos;s tasks as a template from its project detail page.
          </p>
        </Card>
      ) : (
        templates.map((template) => (
          <Card key={template.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-neutral-900">{template.name}</h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {template.tasks.length} task{template.tasks.length === 1 ? "" : "s"} · created{" "}
                  {template.createdAt.toLocaleDateString()}
                </p>
              </div>
              <TemplateDeleteButton templateId={template.id} templateName={template.name} />
            </div>

            <div className="mt-3">
              <TemplateRenameForm templateId={template.id} currentName={template.name} />
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <TemplateTasks
                templateId={template.id}
                tasks={template.tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority }))}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
