// Integration test for project/task management + the calendar query
// model — see identity.integration.test.ts for why next/headers and
// server-only are mocked (transitively pulled in via auth-service.ts's
// AuthError).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import {
  addTaskChecklistItem,
  addTaskComment,
  addTaskDependency,
  createMilestone,
  createProject,
  createTask,
  deleteMilestone,
  deleteTaskChecklistItem,
  removeTaskDependency,
  setTaskEstimate,
  setTaskPriority,
  setTaskStatus,
  toggleMilestone,
  toggleTaskChecklistItem,
} from "./project-service";
import { createContentCalendarItem } from "./content-calendar-service";
import { getUpcomingEvents } from "./calendar-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.taskChecklistItem.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientAId: string;
let clientBId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Project Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "proj-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { organizationId: org.id, name: "Client A", companyName: "A Inc", services: "[]" } }),
    prisma.client.create({ data: { organizationId: org.id, name: "Client B", companyName: "B Inc", services: "[]" } }),
  ]);
  clientAId = clientA.id;
  clientBId = clientB.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createProject / createTask / setTaskStatus", () => {
  it("creates a project and records a timeline event", async () => {
    const project = await createProject({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientAId, name: "Launch" });
    expect(project.name).toBe("Launch");

    const timeline = await prisma.clientTimelineEvent.findFirst({ where: { clientId: clientAId, type: "project_created" } });
    expect(timeline).toBeTruthy();
  });

  it("rejects a project for a client in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "Other Co", services: "[]" },
    });
    await expect(
      createProject({ actorUserId: ownerUserId, organizationId: orgId, clientId: otherClient.id, name: "Nope" }),
    ).rejects.toThrow(AuthError);
  });

  it("creates a task, assigns it, and transitions its status", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: ownerUserId } });

    const task = await createTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: project.id,
      title: "Draft brief",
      assigneeId: ownerMembership.id,
    });
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("medium"); // default when not specified

    const createdEvent = await prisma.clientTimelineEvent.findFirst({ where: { clientId: clientAId, type: "task_created" } });
    expect(createdEvent).toBeTruthy();

    const updated = await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, status: "done" });
    expect(updated.status).toBe("done");

    const completedEvent = await prisma.clientTimelineEvent.findFirst({ where: { clientId: clientAId, type: "task_completed" } });
    expect(completedEvent).toBeTruthy();

    // Setting it to "done" again must not create a second completion event.
    await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, status: "done" });
    const completedEventCount = await prisma.clientTimelineEvent.count({ where: { clientId: clientAId, type: "task_completed" } });
    expect(completedEventCount).toBe(1);
  });

  it("creates a task with an explicit priority and allows changing it", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: project.id,
      title: "High priority task",
      priority: "high",
    });
    expect(task.priority).toBe("high");

    const updated = await setTaskPriority({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, priority: "low" });
    expect(updated.priority).toBe("low");
  });

  it("rejects an invalid priority value on both create and update", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    await expect(
      createTask({
        actorUserId: ownerUserId,
        organizationId: orgId,
        projectId: project.id,
        title: "Bad priority",
        // @ts-expect-error deliberately invalid at the type level too
        priority: "urgent",
      }),
    ).rejects.toThrow(AuthError);

    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Valid task" });
    await expect(
      // @ts-expect-error deliberately invalid at the type level too
      setTaskPriority({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, priority: "urgent" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects an assignee who isn't a member of the organization", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    await expect(
      createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "X", assigneeId: "not-a-real-id" }),
    ).rejects.toThrow(AuthError);
  });

  it("creates a task with an explicit estimate and allows changing or clearing it", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: project.id,
      title: "Estimated task",
      estimateHours: 2.5,
    });
    expect(task.estimateHours).toBe(2.5);

    const updated = await setTaskEstimate({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, estimateHours: 4 });
    expect(updated.estimateHours).toBe(4);

    const cleared = await setTaskEstimate({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, estimateHours: null });
    expect(cleared.estimateHours).toBeNull();
  });

  it("rejects a negative or non-finite estimate on both create and update", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    await expect(
      createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Bad estimate", estimateHours: -1 }),
    ).rejects.toThrow(AuthError);

    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Valid task" });
    await expect(
      setTaskEstimate({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, estimateHours: NaN }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a task write from a member with no clients:write on the project's client", async () => {
    const designer = await prisma.user.create({
      data: { email: "proj-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: orgId, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });

    await expect(
      createTask({ actorUserId: designer.id, organizationId: orgId, projectId: project.id, title: "Should fail" }),
    ).rejects.toThrow();
  });
});

describe("addTaskChecklistItem / toggleTaskChecklistItem / deleteTaskChecklistItem", () => {
  it("adds items in order, toggles done, and deletes an item", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Checklist task" });

    const first = await addTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, text: "Draft v1" });
    const second = await addTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, text: "Get sign-off" });
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(first.done).toBe(false);

    const toggled = await toggleTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, itemId: first.id });
    expect(toggled.done).toBe(true);
    const toggledBack = await toggleTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, itemId: first.id });
    expect(toggledBack.done).toBe(false);

    await deleteTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, itemId: second.id });
    const remaining = await prisma.taskChecklistItem.findMany({ where: { taskId: task.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(first.id);
  });

  it("rejects an empty item text", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Empty text task" });
    await expect(
      addTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, text: "   " }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a write from a member with no clients:write on the task's client", async () => {
    const designer = await prisma.user.findFirstOrThrow({ where: { email: "proj-designer@test.example" } });
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Permission check task" });

    await expect(
      addTaskChecklistItem({ actorUserId: designer.id, organizationId: orgId, taskId: task.id, text: "Should fail" }),
    ).rejects.toThrow();
  });

  it("rejects a task or item from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Checklist Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "checklist-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await createProject({ actorUserId: otherOwner.id, organizationId: otherOrg.id, clientId: otherClient.id, name: "Other Project" });
    const otherTask = await createTask({ actorUserId: otherOwner.id, organizationId: otherOrg.id, projectId: otherProject.id, title: "Other Task" });
    const otherItem = await addTaskChecklistItem({ actorUserId: otherOwner.id, organizationId: otherOrg.id, taskId: otherTask.id, text: "Other item" });

    await expect(
      addTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, taskId: otherTask.id, text: "Nope" }),
    ).rejects.toThrow(AuthError);
    await expect(
      toggleTaskChecklistItem({ actorUserId: ownerUserId, organizationId: orgId, itemId: otherItem.id }),
    ).rejects.toThrow(AuthError);
  });
});

describe("addTaskComment", () => {
  it("adds comments in order, attributed to the real author", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Comment task" });
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: ownerUserId } });

    const first = await addTaskComment({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, text: "Looks good" });
    const second = await addTaskComment({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, text: "One more pass" });

    expect(first.authorId).toBe(ownerMembership.id);

    const stored = await prisma.taskComment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
    expect(stored.map((c) => c.text)).toEqual([first.text, second.text]);
  });

  it("rejects an empty comment", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Empty comment task" });
    await expect(
      addTaskComment({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, text: "   " }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a write from a member with no clients:write on the task's client", async () => {
    const designer = await prisma.user.findFirstOrThrow({ where: { email: "proj-designer@test.example" } });
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Permission comment task" });

    await expect(
      addTaskComment({ actorUserId: designer.id, organizationId: orgId, taskId: task.id, text: "Should fail" }),
    ).rejects.toThrow();
  });

  it("rejects a task from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Comment Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "comment-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await createProject({ actorUserId: otherOwner.id, organizationId: otherOrg.id, clientId: otherClient.id, name: "Other Project" });
    const otherTask = await createTask({ actorUserId: otherOwner.id, organizationId: otherOrg.id, projectId: otherProject.id, title: "Other Task" });

    await expect(
      addTaskComment({ actorUserId: ownerUserId, organizationId: orgId, taskId: otherTask.id, text: "Nope" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("createMilestone / toggleMilestone / deleteMilestone", () => {
  it("creates a milestone, toggles it done, and deletes it", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const milestone = await createMilestone({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: project.id,
      name: "Kickoff",
      dueDate: new Date("2030-01-15"),
    });
    expect(milestone.done).toBe(false);

    const toggled = await toggleMilestone({ actorUserId: ownerUserId, organizationId: orgId, milestoneId: milestone.id });
    expect(toggled.done).toBe(true);
    const toggledBack = await toggleMilestone({ actorUserId: ownerUserId, organizationId: orgId, milestoneId: milestone.id });
    expect(toggledBack.done).toBe(false);

    await deleteMilestone({ actorUserId: ownerUserId, organizationId: orgId, milestoneId: milestone.id });
    expect(await prisma.milestone.findUnique({ where: { id: milestone.id } })).toBeNull();
  });

  it("rejects an empty milestone name", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    await expect(
      createMilestone({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, name: "   ", dueDate: new Date("2030-01-01") }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a write from a member with no clients:write on the project's client", async () => {
    const designer = await prisma.user.findFirstOrThrow({ where: { email: "proj-designer@test.example" } });
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    await expect(
      createMilestone({ actorUserId: designer.id, organizationId: orgId, projectId: project.id, name: "Should fail", dueDate: new Date("2030-01-01") }),
    ).rejects.toThrow();
  });

  it("rejects a project or milestone from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Milestone Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "milestone-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await createProject({ actorUserId: otherOwner.id, organizationId: otherOrg.id, clientId: otherClient.id, name: "Other Project" });
    const otherMilestone = await createMilestone({
      actorUserId: otherOwner.id,
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: "Other Milestone",
      dueDate: new Date("2030-01-01"),
    });

    await expect(
      createMilestone({ actorUserId: ownerUserId, organizationId: orgId, projectId: otherProject.id, name: "Nope", dueDate: new Date("2030-01-01") }),
    ).rejects.toThrow(AuthError);
    await expect(
      toggleMilestone({ actorUserId: ownerUserId, organizationId: orgId, milestoneId: otherMilestone.id }),
    ).rejects.toThrow(AuthError);
  });
});

describe("addTaskDependency / removeTaskDependency / blocked completion", () => {
  it("adds a dependency, blocks completion of the blocked task until the blocker is done, then removing the dependency unblocks it", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const blocker = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Design assets" });
    const blocked = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Publish campaign" });

    const dependency = await addTaskDependency({
      actorUserId: ownerUserId,
      organizationId: orgId,
      taskId: blocked.id,
      blockedByTaskId: blocker.id,
    });
    expect(dependency.taskId).toBe(blocked.id);
    expect(dependency.blockedByTaskId).toBe(blocker.id);

    // Non-"done" transitions are unaffected by the block.
    await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocked.id, status: "in_progress" });

    await expect(
      setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocked.id, status: "done" }),
    ).rejects.toThrow(AuthError);

    await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocker.id, status: "done" });
    const nowDone = await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocked.id, status: "done" });
    expect(nowDone.status).toBe("done");

    // Removing a dependency unblocks even an incomplete blocker.
    await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocker.id, status: "todo" });
    await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocked.id, status: "todo" });
    await expect(
      setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocked.id, status: "done" }),
    ).rejects.toThrow(AuthError);

    await removeTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, dependencyId: dependency.id });
    const unblocked = await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocked.id, status: "done" });
    expect(unblocked.status).toBe("done");
  });

  it("rejects a task being blocked by itself", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Self-blocked task" });
    await expect(
      addTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, blockedByTaskId: task.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a duplicate dependency and the direct reverse pair", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const a = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Dup A" });
    const b = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Dup B" });

    await addTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, taskId: a.id, blockedByTaskId: b.id });
    await expect(
      addTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, taskId: a.id, blockedByTaskId: b.id }),
    ).rejects.toThrow(AuthError);
    await expect(
      addTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, taskId: b.id, blockedByTaskId: a.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a blocker task from a different project", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const otherProject = await createProject({ actorUserId: ownerUserId, organizationId: orgId, clientId: clientBId, name: "Cross-project" });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Same-project task" });
    const otherTask = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: otherProject.id, title: "Different-project task" });

    await expect(
      addTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, blockedByTaskId: otherTask.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a write from a member with no clients:write on the task's client", async () => {
    const designer = await prisma.user.findFirstOrThrow({ where: { email: "proj-designer@test.example" } });
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const a = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Perm A" });
    const b = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Perm B" });

    await expect(
      addTaskDependency({ actorUserId: designer.id, organizationId: orgId, taskId: a.id, blockedByTaskId: b.id }),
    ).rejects.toThrow();
  });

  it("rejects a task or dependency from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Dependency Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "dependency-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await createProject({ actorUserId: otherOwner.id, organizationId: otherOrg.id, clientId: otherClient.id, name: "Other Project" });
    const otherA = await createTask({ actorUserId: otherOwner.id, organizationId: otherOrg.id, projectId: otherProject.id, title: "Other A" });
    const otherB = await createTask({ actorUserId: otherOwner.id, organizationId: otherOrg.id, projectId: otherProject.id, title: "Other B" });
    const otherDependency = await addTaskDependency({ actorUserId: otherOwner.id, organizationId: otherOrg.id, taskId: otherA.id, blockedByTaskId: otherB.id });

    await expect(
      addTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, taskId: otherA.id, blockedByTaskId: otherB.id }),
    ).rejects.toThrow(AuthError);
    await expect(
      removeTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, dependencyId: otherDependency.id }),
    ).rejects.toThrow(AuthError);
  });
});

describe("getUpcomingEvents", () => {
  it("unifies task, project, invoice, and content calendar dates within the window and scopes by client", async () => {
    const projectA = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const projectB = await createProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId: clientBId,
      name: "Client B Project",
      dueDate: new Date("2030-06-15"),
    });

    await createTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: projectA.id,
      title: "Due soon task",
      dueDate: new Date("2030-06-10"),
    });

    await prisma.invoice.create({
      data: { clientId: clientAId, amountCents: 50000, dueAt: new Date("2030-06-12") },
    });

    await createContentCalendarItem({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId: clientAId,
      title: "Launch post",
      channel: "instagram",
      dueDate: new Date("2030-06-11"),
      publishAt: new Date("2030-06-20"),
    });

    await createMilestone({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: projectA.id,
      name: "Beta launch",
      dueDate: new Date("2030-06-18"),
    });

    const from = new Date("2030-06-01");
    const to = new Date("2030-06-30");

    const allEvents = await getUpcomingEvents({ organizationId: orgId, from, to });
    const types = allEvents.map((e) => e.type).sort();
    expect(types).toEqual(["content_due", "content_publish", "invoice_due", "milestone_due", "project_due", "task_due"]);
    // Sorted chronologically.
    expect(allEvents[0].date.getTime()).toBeLessThanOrEqual(allEvents[allEvents.length - 1].date.getTime());

    const scopedToA = await getUpcomingEvents({ organizationId: orgId, clientIds: [clientAId], from, to });
    expect(scopedToA.every((e) => e.clientId === clientAId)).toBe(true);
    expect(scopedToA.some((e) => e.title === projectB.name)).toBe(false);
  });

  it("flags a milestone as overdue only when it's past due and not done", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    const now = new Date();
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const overdueMilestone = await createMilestone({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, name: "Overdue milestone", dueDate: past });
    const doneMilestone = await createMilestone({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, name: "Done milestone", dueDate: past });
    await toggleMilestone({ actorUserId: ownerUserId, organizationId: orgId, milestoneId: doneMilestone.id });
    await createMilestone({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, name: "Future milestone", dueDate: future });

    const from = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const events = await getUpcomingEvents({ organizationId: orgId, clientIds: [clientAId], from, to });
    const milestoneEvents = events.filter((e) => e.type === "milestone_due");

    expect(milestoneEvents.find((e) => e.title === "Overdue milestone")?.overdue).toBe(true);
    expect(milestoneEvents.find((e) => e.title === "Done milestone")?.overdue).toBe(false);
    expect(milestoneEvents.find((e) => e.title === "Future milestone")?.overdue).toBe(false);

    await prisma.milestone.delete({ where: { id: overdueMilestone.id } });
    await prisma.milestone.deleteMany({ where: { projectId: project.id, name: { in: ["Done milestone", "Future milestone"] } } });
  });
});
