// Integration test for the project template service — see
// identity.integration.test.ts for why next/headers and server-only are
// mocked (transitively pulled in via auth-service.ts's AuthError).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { createTask } from "./project-service";
import {
  addTemplateTask,
  createProjectFromTemplate,
  createProjectTemplateFromProject,
  deleteProjectTemplate,
  listProjectTemplates,
  listProjectTemplatesForManagement,
  removeTemplateTask,
  renameProjectTemplate,
} from "./project-template-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.projectTemplateTask.deleteMany();
  await prisma.projectTemplate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let designerMembershipId: string;
let clientId: string;
let sourceProjectId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Project Template Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "template-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "template-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  const designerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" },
  });
  designerMembershipId = designerMembership.id;

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Template Client", companyName: "Template Co", services: "[]" },
  });
  clientId = client.id;

  const project = await prisma.project.create({ data: { clientId, name: "Source Project" } });
  sourceProjectId = project.id;
  await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: sourceProjectId, title: "Draft brief", priority: "high" });
  await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: sourceProjectId, title: "Get sign-off", priority: "low" });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createProjectTemplateFromProject", () => {
  it("snapshots the project's real tasks (title + priority, in order) into a real template", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Standard Launch",
    });

    expect(template.name).toBe("Standard Launch");
    expect(template.tasks).toHaveLength(2);
    expect(template.tasks.map((t) => ({ title: t.title, priority: t.priority, position: t.position }))).toEqual([
      { title: "Draft brief", priority: "high", position: 0 },
      { title: "Get sign-off", priority: "low", position: 1 },
    ]);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "project_template.created", resourceId: template.id } });
    expect(audit).toBeTruthy();
  });

  it("allows an empty project to become a (task-less) template", async () => {
    const emptyProject = await prisma.project.create({ data: { clientId, name: "Empty Project" } });
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: emptyProject.id,
      name: "Empty Template",
    });
    expect(template.tasks).toHaveLength(0);
  });

  it("rejects an empty template name", async () => {
    await expect(
      createProjectTemplateFromProject({ actorUserId: ownerUserId, organizationId: orgId, projectId: sourceProjectId, name: "   " }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a write from a member with no clients:write on the project's client", async () => {
    await expect(
      createProjectTemplateFromProject({ actorUserId: designerUserId, organizationId: orgId, projectId: sourceProjectId, name: "Should fail" }),
    ).rejects.toThrow();
  });

  it("rejects a project from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Template Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });

    await expect(
      createProjectTemplateFromProject({ actorUserId: ownerUserId, organizationId: orgId, projectId: otherProject.id, name: "Nope" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("listProjectTemplates", () => {
  it("returns the org's real templates with their tasks", async () => {
    const templates = await listProjectTemplates({ actorUserId: ownerUserId, organizationId: orgId, clientId });
    expect(templates.length).toBeGreaterThanOrEqual(1);
    const standard = templates.find((t) => t.name === "Standard Launch");
    expect(standard?.tasks).toHaveLength(2);
  });

  it("rejects a read from a member with no clients:read on this client", async () => {
    await expect(
      listProjectTemplates({ actorUserId: designerUserId, organizationId: orgId, clientId: "not-a-real-id" }),
    ).rejects.toThrow();
  });
});

describe("createProjectFromTemplate", () => {
  it("creates a real project with real tasks copied from the template", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Instantiation Source",
    });

    const project = await createProjectFromTemplate({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      templateId: template.id,
      name: "New Launch Project",
    });
    expect(project.name).toBe("New Launch Project");

    const tasks = await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { title: "asc" } });
    expect(tasks.map((t) => ({ title: t.title, priority: t.priority, status: t.status }))).toEqual([
      { title: "Draft brief", priority: "high", status: "todo" },
      { title: "Get sign-off", priority: "low", status: "todo" },
    ]);

    const timeline = await prisma.clientTimelineEvent.findFirst({ where: { clientId, summary: { contains: "New Launch Project" } } });
    expect(timeline).toBeTruthy();
  });

  it("falls back to the template's own name when no name is given", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Default Name Template",
    });
    const project = await createProjectFromTemplate({ actorUserId: ownerUserId, organizationId: orgId, clientId, templateId: template.id });
    expect(project.name).toBe("Default Name Template");
  });

  it("rejects a write from a member with no clients:write on this client", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Perm Check Template",
    });
    await expect(
      createProjectFromTemplate({ actorUserId: designerUserId, organizationId: orgId, clientId, templateId: template.id }),
    ).rejects.toThrow();
  });

  it("rejects a template from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Instantiate Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "other-instantiate-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Source Project" } });
    const otherTemplate = await createProjectTemplateFromProject({
      actorUserId: otherOwner.id,
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: "Other Org Template",
    });

    await expect(
      createProjectFromTemplate({ actorUserId: ownerUserId, organizationId: orgId, clientId, templateId: otherTemplate.id }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects an unknown client", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Unknown Client Template",
    });
    await expect(
      createProjectFromTemplate({ actorUserId: ownerUserId, organizationId: orgId, clientId: "not-a-real-id", templateId: template.id }),
    ).rejects.toThrow(AuthError);
  });
});

describe("renameProjectTemplate", () => {
  it("persists a new name and records an audit event", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Rename Me",
    });

    const renamed = await renameProjectTemplate({
      actorUserId: ownerUserId,
      organizationId: orgId,
      templateId: template.id,
      name: "Renamed Template",
    });
    expect(renamed.name).toBe("Renamed Template");

    const fromDb = await prisma.projectTemplate.findUnique({ where: { id: template.id } });
    expect(fromDb?.name).toBe("Renamed Template");

    const audit = await prisma.auditEvent.findFirst({ where: { action: "project_template.renamed", resourceId: template.id } });
    expect(audit).toBeTruthy();
  });

  it("rejects an empty name", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Empty Rename Source",
    });
    await expect(
      renameProjectTemplate({ actorUserId: ownerUserId, organizationId: orgId, templateId: template.id, name: "   " }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a template from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Rename Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "rename-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherTemplate = await createProjectTemplateFromProject({
      actorUserId: otherOwner.id,
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: "Other Org Rename Template",
    });

    await expect(
      renameProjectTemplate({ actorUserId: ownerUserId, organizationId: orgId, templateId: otherTemplate.id, name: "Hijacked" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("deleteProjectTemplate", () => {
  it("deletes the template and all of its task rows", async () => {
    const project = await prisma.project.create({ data: { clientId, name: "Delete Source Project" } });
    await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Task A" });
    await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Task B" });
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: project.id,
      name: "Delete Me",
    });
    expect(template.tasks).toHaveLength(2);

    await deleteProjectTemplate({ actorUserId: ownerUserId, organizationId: orgId, templateId: template.id });

    const fromDb = await prisma.projectTemplate.findUnique({ where: { id: template.id } });
    expect(fromDb).toBeNull();
    const remainingTasks = await prisma.projectTemplateTask.findMany({ where: { templateId: template.id } });
    expect(remainingTasks).toHaveLength(0);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "project_template.deleted", resourceId: template.id } });
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit!.changeSet!)).toMatchObject({ name: "Delete Me", taskCount: 2 });
  });

  it("rejects a template from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Delete Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "delete-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherTemplate = await createProjectTemplateFromProject({
      actorUserId: otherOwner.id,
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: "Other Org Delete Template",
    });

    await expect(
      deleteProjectTemplate({ actorUserId: ownerUserId, organizationId: orgId, templateId: otherTemplate.id }),
    ).rejects.toThrow(AuthError);
  });
});

describe("addTemplateTask", () => {
  it("appends a task at the correct next position", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Add Task Template",
    });
    expect(template.tasks).toHaveLength(2);

    const task = await addTemplateTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      templateId: template.id,
      title: "New third task",
      priority: "high",
    });
    expect(task.position).toBe(2);
    expect(task.priority).toBe("high");

    const secondTask = await addTemplateTask({
      actorUserId: ownerUserId,
      organizationId: orgId,
      templateId: template.id,
      title: "Fourth task, default priority",
    });
    expect(secondTask.position).toBe(3);
    expect(secondTask.priority).toBe("medium");

    const audit = await prisma.auditEvent.findFirst({ where: { action: "project_template.task_added", resourceId: task.id } });
    expect(audit).toBeTruthy();
  });

  it("rejects an invalid priority", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Invalid Priority Template",
    });
    await expect(
      addTemplateTask({
        actorUserId: ownerUserId,
        organizationId: orgId,
        templateId: template.id,
        title: "Bad priority task",
        priority: "urgent",
      }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a template from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Add Task Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "add-task-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherTemplate = await createProjectTemplateFromProject({
      actorUserId: otherOwner.id,
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: "Other Org Add Task Template",
    });

    await expect(
      addTemplateTask({ actorUserId: ownerUserId, organizationId: orgId, templateId: otherTemplate.id, title: "Nope" }),
    ).rejects.toThrow(AuthError);
  });
});

describe("removeTemplateTask", () => {
  it("removes the task row and leaves the others intact", async () => {
    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Remove Task Template",
    });
    expect(template.tasks).toHaveLength(2);
    const [firstTask, secondTask] = template.tasks;

    await removeTemplateTask({ actorUserId: ownerUserId, organizationId: orgId, templateTaskId: firstTask.id });

    const remaining = await prisma.projectTemplateTask.findMany({ where: { templateId: template.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(secondTask.id);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "project_template.task_removed", resourceId: firstTask.id } });
    expect(audit).toBeTruthy();
  });

  it("rejects a template task from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Remove Task Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "remove-task-other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    await createTask({ actorUserId: otherOwner.id, organizationId: otherOrg.id, projectId: otherProject.id, title: "Other task" });
    const otherTemplate = await createProjectTemplateFromProject({
      actorUserId: otherOwner.id,
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      name: "Other Org Remove Task Template",
    });
    const otherTaskId = otherTemplate.tasks[0].id;

    await expect(
      removeTemplateTask({ actorUserId: ownerUserId, organizationId: orgId, templateTaskId: otherTaskId }),
    ).rejects.toThrow(AuthError);
  });
});

describe("listProjectTemplatesForManagement", () => {
  it("returns the org's real templates with their tasks", async () => {
    const templates = await listProjectTemplatesForManagement({ actorUserId: ownerUserId, organizationId: orgId });
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });
});

describe("org-wide clients:write gating for template editing", () => {
  it("denies a per-client (not org-wide) clients:write ScopedGrant on every write and the management list", async () => {
    // Give the designer clients:write, but scoped to one specific client
    // (clientId !== null), not org-wide (clientId: null) — policy.ts's
    // can() only honors a per-client grant against a matching clientId
    // argument, and none of these functions pass one.
    await prisma.scopedGrant.create({
      data: { membershipId: designerMembershipId, permission: "clients:write", clientId },
    });

    const template = await createProjectTemplateFromProject({
      actorUserId: ownerUserId,
      organizationId: orgId,
      projectId: sourceProjectId,
      name: "Perm Boundary Template",
    });

    await expect(
      renameProjectTemplate({ actorUserId: designerUserId, organizationId: orgId, templateId: template.id, name: "Should fail" }),
    ).rejects.toThrow();
    await expect(
      deleteProjectTemplate({ actorUserId: designerUserId, organizationId: orgId, templateId: template.id }),
    ).rejects.toThrow();
    await expect(
      addTemplateTask({ actorUserId: designerUserId, organizationId: orgId, templateId: template.id, title: "Should fail" }),
    ).rejects.toThrow();
    await expect(
      removeTemplateTask({ actorUserId: designerUserId, organizationId: orgId, templateTaskId: template.tasks[0].id }),
    ).rejects.toThrow();
    await expect(
      listProjectTemplatesForManagement({ actorUserId: designerUserId, organizationId: orgId }),
    ).rejects.toThrow();

    // Sanity: the org-wide owner can still do all of it, proving the
    // rejections above are the per-client-grant boundary, not a bug that
    // would reject everyone.
    const renamed = await renameProjectTemplate({
      actorUserId: ownerUserId,
      organizationId: orgId,
      templateId: template.id,
      name: "Owner Can Still Rename",
    });
    expect(renamed.name).toBe("Owner Can Still Rename");
  });
});
