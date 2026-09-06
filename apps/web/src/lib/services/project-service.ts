import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

export async function createProject(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  name: string;
  dueDate?: Date;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: params.clientId,
  });
  await assertClientInOrg(params.clientId, params.organizationId);

  if (!params.name.trim()) throw new AuthError("Project name is required.");

  const project = await prisma.project.create({
    data: { clientId: params.clientId, name: params.name.trim(), dueDate: params.dueDate },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "project.created",
    resourceType: "Project",
    resourceId: project.id,
    clientId: params.clientId,
    result: "SUCCESS",
    changeSet: { name: project.name },
  });

  await prisma.clientTimelineEvent.create({
    data: { clientId: params.clientId, type: "project_created", summary: `Project "${project.name}" created.` },
  });

  return project;
}

async function assertProjectInOrg(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { organizationId } },
    include: { client: true },
  });
  if (!project) throw new AuthError("Project not found.");
  return project;
}

export async function createTask(params: {
  actorUserId: string;
  organizationId: string;
  projectId: string;
  title: string;
  assigneeId?: string;
  dueDate?: Date;
}) {
  const project = await assertProjectInOrg(params.projectId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: project.clientId,
  });

  if (!params.title.trim()) throw new AuthError("Task title is required.");

  if (params.assigneeId) {
    const assignee = await prisma.membership.findFirst({
      where: { id: params.assigneeId, organizationId: params.organizationId },
    });
    if (!assignee) throw new AuthError("Assignee is not a member of this organization.");
  }

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: params.title.trim(),
      assigneeId: params.assigneeId,
      dueDate: params.dueDate,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task.created",
    resourceType: "Task",
    resourceId: task.id,
    clientId: project.clientId,
    result: "SUCCESS",
    changeSet: { title: task.title, projectId: project.id },
  });

  return task;
}

const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export async function setTaskStatus(params: {
  actorUserId: string;
  organizationId: string;
  taskId: string;
  status: TaskStatus;
}) {
  if (!TASK_STATUSES.includes(params.status)) throw new AuthError("Invalid task status.");

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: { project: { include: { client: true } } },
  });
  if (!task || task.project.client.organizationId !== params.organizationId) {
    throw new AuthError("Task not found.");
  }

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: task.project.clientId,
  });

  const updated = await prisma.task.update({ where: { id: task.id }, data: { status: params.status } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task.status_changed",
    resourceType: "Task",
    resourceId: task.id,
    clientId: task.project.clientId,
    result: "SUCCESS",
    changeSet: { before: { status: task.status }, after: { status: params.status } },
  });

  return updated;
}
