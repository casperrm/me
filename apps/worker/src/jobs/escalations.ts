import { prisma } from "@cedar/db";
import { hasRecentNotification, notifyClientWriters } from "@cedar/events";
import { logger } from "@cedar/observability";

// Once a resource has been escalated, don't escalate it again for a full
// day even if it's still overdue (Bible Section 30: "Deduplicate noisy
// alerts") — this is apps/worker's first real job (Phase 0's queue/worker
// runtime existed with no real job yet; this closes that).
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function escalateOverdueTasks() {
  const overdue = await prisma.task.findMany({
    where: { dueDate: { lt: new Date() }, status: { not: "done" } },
    include: { project: { include: { client: true } } },
  });

  let escalated = 0;
  for (const task of overdue) {
    const alreadyNotified = await hasRecentNotification({
      resourceType: "Task",
      resourceId: task.id,
      category: "task_overdue",
      sinceMs: DEDUPE_WINDOW_MS,
    });
    if (alreadyNotified) continue;

    await notifyClientWriters({
      organizationId: task.project.client.organizationId,
      clientId: task.project.clientId,
      severity: "WARNING",
      category: "task_overdue",
      resourceType: "Task",
      resourceId: task.id,
      title: `Task overdue: ${task.title}`,
      body: `Was due ${task.dueDate!.toLocaleDateString()}.`,
      actionUrl: `/clients/${task.project.clientId}/projects/${task.projectId}`,
    });
    escalated += 1;
  }
  return escalated;
}

async function escalateOverdueProjects() {
  const overdue = await prisma.project.findMany({
    where: { dueDate: { lt: new Date() }, status: { notIn: ["DELIVERED", "ARCHIVED"] } },
    include: { client: true },
  });

  let escalated = 0;
  for (const project of overdue) {
    const alreadyNotified = await hasRecentNotification({
      resourceType: "Project",
      resourceId: project.id,
      category: "project_overdue",
      sinceMs: DEDUPE_WINDOW_MS,
    });
    if (alreadyNotified) continue;

    await notifyClientWriters({
      organizationId: project.client.organizationId,
      clientId: project.clientId,
      severity: "WARNING",
      category: "project_overdue",
      resourceType: "Project",
      resourceId: project.id,
      title: `Project overdue: ${project.name}`,
      body: `Was due ${project.dueDate!.toLocaleDateString()}.`,
      actionUrl: `/clients/${project.clientId}/projects/${project.id}`,
    });
    escalated += 1;
  }
  return escalated;
}

async function escalateOverdueContent() {
  const overdue = await prisma.contentCalendarItem.findMany({
    where: { dueDate: { lt: new Date() }, status: { notIn: ["PUBLISHED", "FAILED"] } },
    include: { client: true },
  });

  let escalated = 0;
  for (const item of overdue) {
    const alreadyNotified = await hasRecentNotification({
      resourceType: "ContentCalendarItem",
      resourceId: item.id,
      category: "content_overdue",
      sinceMs: DEDUPE_WINDOW_MS,
    });
    if (alreadyNotified) continue;

    await notifyClientWriters({
      organizationId: item.client.organizationId,
      clientId: item.clientId,
      severity: "WARNING",
      category: "content_overdue",
      resourceType: "ContentCalendarItem",
      resourceId: item.id,
      title: `Content item overdue: ${item.title}`,
      body: `Was due ${item.dueDate!.toLocaleDateString()} (still ${item.status}).`,
      actionUrl: `/clients/${item.clientId}/content`,
    });
    escalated += 1;
  }
  return escalated;
}

/**
 * Section 30: "Escalation rules for overdue approvals, project risk,
 * payment risk, integration degradation, security events, and failed
 * workflows." This covers the overdue-deliverable half (tasks, projects,
 * content calendar due dates) — payment risk / integration degradation /
 * security events need modules that don't exist yet (real invoicing
 * automation, Phase 4 connectors) and are explicitly not faked here.
 */
export async function runEscalationScan() {
  const [tasks, projects, content] = await Promise.all([
    escalateOverdueTasks(),
    escalateOverdueProjects(),
    escalateOverdueContent(),
  ]);
  const total = tasks + projects + content;
  logger.info("escalation scan complete", { tasksEscalated: tasks, projectsEscalated: projects, contentEscalated: content });
  return total;
}
