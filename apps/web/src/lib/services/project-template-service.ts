import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";
import { TASK_PRIORITIES } from "./project-service";

async function assertProjectInOrg(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { organizationId } },
    include: { client: true },
  });
  if (!project) throw new AuthError("Project not found.");
  return project;
}

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

/**
 * Section 12's "reusable project templates" — the smallest real cut: a
 * template snapshots one project's task titles and priorities (not
 * milestones, checklist items, or dependencies — see the schema comment
 * on `ProjectTemplate` and docs/specs/projects-and-calendar.md for the
 * scope boundary). A template is org-wide, not tied back to the client
 * it was captured from, so it can be reused for any client.
 */
export async function createProjectTemplateFromProject(params: {
  actorUserId: string;
  organizationId: string;
  projectId: string;
  name: string;
}) {
  const project = await assertProjectInOrg(params.projectId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: project.clientId,
  });

  const name = params.name.trim();
  if (!name) throw new AuthError("Template name is required.");

  const tasks = await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });

  const template = await prisma.projectTemplate.create({
    data: {
      organizationId: params.organizationId,
      name,
      tasks: {
        create: tasks.map((t, i) => ({ title: t.title, priority: t.priority, position: i })),
      },
    },
    include: { tasks: true },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "project_template.created",
    resourceType: "ProjectTemplate",
    resourceId: template.id,
    clientId: project.clientId,
    result: "SUCCESS",
    changeSet: { name: template.name, sourceProjectId: project.id, taskCount: template.tasks.length },
  });

  return template;
}

/**
 * Templates are org-wide, not client-scoped, but this is always called
 * from a specific client's "new project" flow, so it's gated behind
 * `clients:read` on that client — the same read access the page itself
 * already required to render.
 */
export async function listProjectTemplates(params: { actorUserId: string; organizationId: string; clientId: string }) {
  await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:read",
    clientId: params.clientId,
  });

  return prisma.projectTemplate.findMany({
    where: { organizationId: params.organizationId },
    include: { tasks: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

async function assertTemplateInOrg(templateId: string, organizationId: string) {
  const template = await prisma.projectTemplate.findFirst({
    where: { id: templateId, organizationId },
    include: { tasks: { orderBy: { position: "asc" } } },
  });
  if (!template) throw new AuthError("Template not found.");
  return template;
}

/**
 * Instantiates a new Project for `clientId`, pre-populated with tasks
 * copied from the template (title + priority; status defaults to
 * "todo", no assignee/due date/checklist/dependencies — those are
 * per-run details, not part of the reusable shape). Bulk-inserted and
 * summarized in one audit event rather than emitting one per task, the
 * same reasoning already applied to routine sub-task bookkeeping
 * elsewhere in this module.
 */
export async function createProjectFromTemplate(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  templateId: string;
  name?: string;
}) {
  const client = await assertClientInOrg(params.clientId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const template = await assertTemplateInOrg(params.templateId, params.organizationId);

  const name = (params.name ?? template.name).trim();
  if (!name) throw new AuthError("Project name is required.");

  const project = await prisma.project.create({ data: { clientId: client.id, name } });

  if (template.tasks.length > 0) {
    await prisma.task.createMany({
      data: template.tasks.map((t) => ({ projectId: project.id, title: t.title, priority: t.priority })),
    });
  }

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "project.created_from_template",
    resourceType: "Project",
    resourceId: project.id,
    clientId: client.id,
    result: "SUCCESS",
    changeSet: { name: project.name, templateId: template.id, templateName: template.name, taskCount: template.tasks.length },
  });

  await prisma.clientTimelineEvent.create({
    data: {
      clientId: client.id,
      type: "project_created",
      summary: `Project "${project.name}" created from template "${template.name}".`,
    },
  });

  return project;
}

/**
 * Template editing (docs/specs/projects-and-calendar.md's previously
 * unbuilt refinement). Unlike creating/instantiating a template, none of
 * these are naturally scoped to one client's context — managing the
 * shared template library is org-wide, so every function below is gated
 * on `clients:write` with **no `clientId`**, which `can()`
 * (packages/domain/src/policy.ts) restricts to an actor who holds
 * `clients:write` organization-wide (OWNER always; ADMIN via
 * `ROLE_GLOBAL_PERMISSIONS`; anyone else only via an explicit org-wide
 * `ScopedGrant` with `clientId: null`) — the same tier of access that
 * already lets someone create a template from any client's project.
 */

export async function renameProjectTemplate(params: {
  actorUserId: string;
  organizationId: string;
  templateId: string;
  name: string;
}) {
  const template = await assertTemplateInOrg(params.templateId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
  });

  const name = params.name.trim();
  if (!name) throw new AuthError("Template name is required.");

  const updated = await prisma.projectTemplate.update({ where: { id: template.id }, data: { name } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "project_template.renamed",
    resourceType: "ProjectTemplate",
    resourceId: template.id,
    result: "SUCCESS",
    changeSet: { previousName: template.name, name: updated.name },
  });

  return updated;
}

/**
 * `ProjectTemplateTask.template` has no `onDelete: Cascade` set on its
 * relation, so deleting a `ProjectTemplate` that still has task rows
 * would hit a DB foreign-key error — the task rows are deleted first, in
 * the same transaction as the template row, rather than adding a
 * migration for a cascade.
 */
export async function deleteProjectTemplate(params: { actorUserId: string; organizationId: string; templateId: string }) {
  const template = await assertTemplateInOrg(params.templateId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
  });

  await prisma.$transaction([
    prisma.projectTemplateTask.deleteMany({ where: { templateId: template.id } }),
    prisma.projectTemplate.delete({ where: { id: template.id } }),
  ]);

  // The resource itself is gone after this, so its name/task count only
  // survive in the audit trail from here on.
  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "project_template.deleted",
    resourceType: "ProjectTemplate",
    resourceId: template.id,
    result: "SUCCESS",
    changeSet: { name: template.name, taskCount: template.tasks.length },
  });

  return { id: template.id };
}

/**
 * Appends one task at the end of the template's task list — `position` is
 * just the current task count at insert time, the same append-only
 * convention `addTaskChecklistItem` (project-service.ts) already uses for
 * checklist items. No reordering support anywhere in this module, so none
 * is added here either.
 */
export async function addTemplateTask(params: {
  actorUserId: string;
  organizationId: string;
  templateId: string;
  title: string;
  priority?: string;
}) {
  const template = await assertTemplateInOrg(params.templateId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
  });

  const title = params.title.trim();
  if (!title) throw new AuthError("Task title is required.");

  const priority = params.priority ?? "medium";
  if (!TASK_PRIORITIES.includes(priority as (typeof TASK_PRIORITIES)[number])) {
    throw new AuthError("Invalid task priority.");
  }

  const position = await prisma.projectTemplateTask.count({ where: { templateId: template.id } });

  const task = await prisma.projectTemplateTask.create({
    data: { templateId: template.id, title, priority, position },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "project_template.task_added",
    resourceType: "ProjectTemplateTask",
    resourceId: task.id,
    result: "SUCCESS",
    changeSet: { templateId: template.id, title: task.title, priority: task.priority, position: task.position },
  });

  return task;
}

async function assertTemplateTaskInOrg(templateTaskId: string, organizationId: string) {
  const task = await prisma.projectTemplateTask.findUnique({
    where: { id: templateTaskId },
    include: { template: true },
  });
  if (!task || task.template.organizationId !== organizationId) {
    throw new AuthError("Template task not found.");
  }
  return task;
}

export async function removeTemplateTask(params: { actorUserId: string; organizationId: string; templateTaskId: string }) {
  const task = await assertTemplateTaskInOrg(params.templateTaskId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
  });

  await prisma.projectTemplateTask.delete({ where: { id: task.id } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "project_template.task_removed",
    resourceType: "ProjectTemplateTask",
    resourceId: task.id,
    result: "SUCCESS",
    changeSet: { templateId: task.templateId, title: task.title },
  });

  return { id: task.id };
}

/**
 * The management page's own listing — distinct from `listProjectTemplates`
 * above, which is deliberately gated by a specific client's `clients:read`
 * for the "+ From template" picker use case. This one is gated the same
 * org-wide `clients:write` way as the write functions above, so what the
 * management page lets you see matches what it lets you edit.
 */
export async function listProjectTemplatesForManagement(params: { actorUserId: string; organizationId: string }) {
  await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
  });

  return prisma.projectTemplate.findMany({
    where: { organizationId: params.organizationId },
    include: { tasks: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}
