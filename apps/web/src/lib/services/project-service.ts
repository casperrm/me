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

const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

function validateEstimateHours(estimateHours: number | null | undefined) {
  if (estimateHours === null || estimateHours === undefined) return;
  if (!Number.isFinite(estimateHours) || estimateHours < 0) {
    throw new AuthError("Task estimate must be a non-negative number of hours.");
  }
}

export async function createTask(params: {
  actorUserId: string;
  organizationId: string;
  projectId: string;
  title: string;
  assigneeId?: string;
  dueDate?: Date;
  priority?: TaskPriority;
  estimateHours?: number;
}) {
  const project = await assertProjectInOrg(params.projectId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: project.clientId,
  });

  if (!params.title.trim()) throw new AuthError("Task title is required.");

  if (params.priority && !TASK_PRIORITIES.includes(params.priority)) {
    throw new AuthError("Invalid task priority.");
  }

  validateEstimateHours(params.estimateHours);

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
      priority: params.priority,
      estimateHours: params.estimateHours,
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

  await prisma.clientTimelineEvent.create({
    data: { clientId: project.clientId, type: "task_created", summary: `Task "${task.title}" created.` },
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

  // Only completion is timeline-worthy — every other status flip (e.g.
  // todo -> in_progress) is routine progress, not an event worth
  // surfacing on the client's activity history.
  if (params.status === "done" && task.status !== "done") {
    await prisma.clientTimelineEvent.create({
      data: { clientId: task.project.clientId, type: "task_completed", summary: `Task "${task.title}" completed.` },
    });
  }

  return updated;
}

export async function setTaskPriority(params: {
  actorUserId: string;
  organizationId: string;
  taskId: string;
  priority: TaskPriority;
}) {
  if (!TASK_PRIORITIES.includes(params.priority)) throw new AuthError("Invalid task priority.");

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

  const updated = await prisma.task.update({ where: { id: task.id }, data: { priority: params.priority } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task.priority_changed",
    resourceType: "Task",
    resourceId: task.id,
    clientId: task.project.clientId,
    result: "SUCCESS",
    changeSet: { before: { priority: task.priority }, after: { priority: params.priority } },
  });

  return updated;
}

export async function setTaskEstimate(params: {
  actorUserId: string;
  organizationId: string;
  taskId: string;
  estimateHours: number | null;
}) {
  validateEstimateHours(params.estimateHours);

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

  const updated = await prisma.task.update({ where: { id: task.id }, data: { estimateHours: params.estimateHours } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task.estimate_changed",
    resourceType: "Task",
    resourceId: task.id,
    clientId: task.project.clientId,
    result: "SUCCESS",
    changeSet: { before: { estimateHours: task.estimateHours }, after: { estimateHours: params.estimateHours } },
  });

  return updated;
}

async function assertTaskInOrg(taskId: string, organizationId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { client: true } } },
  });
  if (!task || task.project.client.organizationId !== organizationId) {
    throw new AuthError("Task not found.");
  }
  return task;
}

/**
 * Section 12's "task... checklist" (see docs/specs/projects-and-calendar.md
 * for the full scope boundary). New items append to the end — `position`
 * is just the count of existing items at insert time, not a
 * separately-managed reorder field, since nothing here supports
 * reordering yet.
 */
export async function addTaskChecklistItem(params: {
  actorUserId: string;
  organizationId: string;
  taskId: string;
  text: string;
}) {
  const task = await assertTaskInOrg(params.taskId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: task.project.clientId,
  });

  const text = params.text.trim();
  if (!text) throw new AuthError("Checklist item text is required.");

  const position = await prisma.taskChecklistItem.count({ where: { taskId: task.id } });

  const item = await prisma.taskChecklistItem.create({
    data: { taskId: task.id, text, position },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task_checklist_item.created",
    resourceType: "TaskChecklistItem",
    resourceId: item.id,
    clientId: task.project.clientId,
    result: "SUCCESS",
    changeSet: { taskId: task.id, text: item.text },
  });

  return item;
}

async function assertChecklistItemInOrg(itemId: string, organizationId: string) {
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    include: { task: { include: { project: { include: { client: true } } } } },
  });
  if (!item || item.task.project.client.organizationId !== organizationId) {
    throw new AuthError("Checklist item not found.");
  }
  return item;
}

export async function toggleTaskChecklistItem(params: {
  actorUserId: string;
  organizationId: string;
  itemId: string;
}) {
  const item = await assertChecklistItemInOrg(params.itemId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: item.task.project.clientId,
  });

  const updated = await prisma.taskChecklistItem.update({ where: { id: item.id }, data: { done: !item.done } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task_checklist_item.toggled",
    resourceType: "TaskChecklistItem",
    resourceId: item.id,
    clientId: item.task.project.clientId,
    result: "SUCCESS",
    changeSet: { before: { done: item.done }, after: { done: updated.done } },
  });

  return updated;
}

export async function deleteTaskChecklistItem(params: {
  actorUserId: string;
  organizationId: string;
  itemId: string;
}) {
  const item = await assertChecklistItemInOrg(params.itemId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: item.task.project.clientId,
  });

  await prisma.taskChecklistItem.delete({ where: { id: item.id } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task_checklist_item.deleted",
    resourceType: "TaskChecklistItem",
    resourceId: item.id,
    clientId: item.task.project.clientId,
    result: "SUCCESS",
    changeSet: { text: item.text },
  });
}

/**
 * Section 12's "task... comments" — a flat, append-only conversation log
 * on a task, attributed to the org member who wrote it. No edit/delete:
 * a comment is a permanent record, unlike a checklist item, so nothing
 * here supports retracting one — see docs/specs/projects-and-calendar.md.
 */
export async function addTaskComment(params: {
  actorUserId: string;
  organizationId: string;
  taskId: string;
  text: string;
}) {
  const task = await assertTaskInOrg(params.taskId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: task.project.clientId,
  });

  const text = params.text.trim();
  if (!text) throw new AuthError("Comment text is required.");

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, authorId: membership.id, text },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "task_comment.created",
    resourceType: "TaskComment",
    resourceId: comment.id,
    clientId: task.project.clientId,
    result: "SUCCESS",
    changeSet: { taskId: task.id },
  });

  return comment;
}

/**
 * Section 12's "milestones... with overdue/risk signals" — see the
 * schema comment on `Milestone` for why "overdue" is computed
 * (`!done && dueDate < now`) rather than stored. No dependency graph
 * between milestones — see docs/specs/projects-and-calendar.md.
 */
export async function createMilestone(params: {
  actorUserId: string;
  organizationId: string;
  projectId: string;
  name: string;
  dueDate: Date;
}) {
  const project = await assertProjectInOrg(params.projectId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: project.clientId,
  });

  const name = params.name.trim();
  if (!name) throw new AuthError("Milestone name is required.");

  const milestone = await prisma.milestone.create({
    data: { projectId: project.id, name, dueDate: params.dueDate },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "milestone.created",
    resourceType: "Milestone",
    resourceId: milestone.id,
    clientId: project.clientId,
    result: "SUCCESS",
    changeSet: { projectId: project.id, name: milestone.name, dueDate: milestone.dueDate },
  });

  return milestone;
}

async function assertMilestoneInOrg(milestoneId: string, organizationId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { project: { include: { client: true } } },
  });
  if (!milestone || milestone.project.client.organizationId !== organizationId) {
    throw new AuthError("Milestone not found.");
  }
  return milestone;
}

export async function toggleMilestone(params: { actorUserId: string; organizationId: string; milestoneId: string }) {
  const milestone = await assertMilestoneInOrg(params.milestoneId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: milestone.project.clientId,
  });

  const updated = await prisma.milestone.update({ where: { id: milestone.id }, data: { done: !milestone.done } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "milestone.toggled",
    resourceType: "Milestone",
    resourceId: milestone.id,
    clientId: milestone.project.clientId,
    result: "SUCCESS",
    changeSet: { before: { done: milestone.done }, after: { done: updated.done } },
  });

  return updated;
}

export async function deleteMilestone(params: { actorUserId: string; organizationId: string; milestoneId: string }) {
  const milestone = await assertMilestoneInOrg(params.milestoneId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: milestone.project.clientId,
  });

  await prisma.milestone.delete({ where: { id: milestone.id } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "milestone.deleted",
    resourceType: "Milestone",
    resourceId: milestone.id,
    clientId: milestone.project.clientId,
    result: "SUCCESS",
    changeSet: { name: milestone.name },
  });
}
