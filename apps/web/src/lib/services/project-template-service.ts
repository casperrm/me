import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

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
