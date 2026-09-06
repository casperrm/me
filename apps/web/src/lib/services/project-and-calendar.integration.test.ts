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
import { createProject, createTask, setTaskStatus } from "./project-service";
import { createContentCalendarItem } from "./content-calendar-service";
import { getUpcomingEvents } from "./calendar-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.task.deleteMany();
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

    const updated = await setTaskStatus({ actorUserId: ownerUserId, organizationId: orgId, taskId: task.id, status: "done" });
    expect(updated.status).toBe("done");
  });

  it("rejects an assignee who isn't a member of the organization", async () => {
    const project = await prisma.project.findFirstOrThrow({ where: { clientId: clientAId } });
    await expect(
      createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "X", assigneeId: "not-a-real-id" }),
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

    const from = new Date("2030-06-01");
    const to = new Date("2030-06-30");

    const allEvents = await getUpcomingEvents({ organizationId: orgId, from, to });
    const types = allEvents.map((e) => e.type).sort();
    expect(types).toEqual(["content_due", "content_publish", "invoice_due", "project_due", "task_due"]);
    // Sorted chronologically.
    expect(allEvents[0].date.getTime()).toBeLessThanOrEqual(allEvents[allEvents.length - 1].date.getTime());

    const scopedToA = await getUpcomingEvents({ organizationId: orgId, clientIds: [clientAId], from, to });
    expect(scopedToA.every((e) => e.clientId === clientAId)).toBe(true);
    expect(scopedToA.some((e) => e.title === projectB.name)).toBe(false);
  });
});
