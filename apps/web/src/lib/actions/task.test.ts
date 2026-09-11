// The service layer (project-and-calendar.integration.test.ts) already
// covers setTaskStatus's blocked-completion rule thoroughly. This test
// covers only the thin wrapping added on top of it: that
// setTaskStatusAction returns {error} for that real, reachable failure
// instead of letting it propagate into the page's error.tsx boundary
// (see docs/specs/error-boundaries.md's named follow-up).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@cedar/db";
import { addTaskDependency, createProject, createTask } from "@/lib/services/project-service";
import { setTaskPriorityAction, setTaskStatusAction } from "./task";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Task Action Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({ data: { email: "task-action-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });
  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;

  getCurrentActor.mockResolvedValue({ user: { id: ownerUserId }, organizationId: orgId });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("setTaskStatusAction", () => {
  it("returns {error} instead of throwing when completion is blocked by an open dependency", async () => {
    const project = await createProject({ actorUserId: ownerUserId, organizationId: orgId, clientId, name: "Project" });
    const blocker = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Blocker" });
    const blocked = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Blocked" });
    await addTaskDependency({ actorUserId: ownerUserId, organizationId: orgId, taskId: blocked.id, blockedByTaskId: blocker.id });

    const formData = new FormData();
    formData.set("taskId", blocked.id);
    formData.set("status", "done");
    formData.set("clientId", clientId);
    formData.set("projectId", project.id);

    const result = await setTaskStatusAction(formData);

    expect(result?.error).toContain("Cannot complete this task while blocked");

    const stillOpen = await prisma.task.findUniqueOrThrow({ where: { id: blocked.id } });
    expect(stillOpen.status).not.toBe("done");
  });

  it("succeeds and returns undefined for an ordinary, unblocked status change", async () => {
    const project = await createProject({ actorUserId: ownerUserId, organizationId: orgId, clientId, name: "Project 2" });
    const task = await createTask({ actorUserId: ownerUserId, organizationId: orgId, projectId: project.id, title: "Solo task" });

    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("status", "in_progress");
    formData.set("clientId", clientId);
    formData.set("projectId", project.id);

    const result = await setTaskStatusAction(formData);

    expect(result).toBeUndefined();
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("in_progress");
  });
});

// Real, reachable race (docs/specs/mfa.md's own named gap): an owner
// toggles the organization's MFA-required policy on while a privileged
// user still has a page open from before that change — their next write
// throws MfaRequiredError at the service layer (requirePermission),
// which none of these actions used to catch at all before this slice.
describe("MFA enforcement gate", () => {
  it("returns {error} instead of throwing when the acting OWNER hasn't enrolled and the org now requires it", async () => {
    const mfaOrg = await prisma.organization.create({ data: { name: "MFA Gate Test Agency", mfaRequiredForPrivilegedRoles: true } });
    const unenrolledOwner = await prisma.user.create({
      data: { email: "mfa-gate-owner@test.example", name: "Unenrolled Owner", passwordHash: "irrelevant", mfaEnabled: false },
    });
    await prisma.membership.create({ data: { organizationId: mfaOrg.id, userId: unenrolledOwner.id, role: "OWNER", status: "ACTIVE" } });
    const mfaClient = await prisma.client.create({ data: { organizationId: mfaOrg.id, name: "MFA Client", companyName: "Inc", services: "[]" } });
    // Direct Prisma creates, not createProject/createTask — those go
    // through requirePermission too, and this actor is deliberately
    // unenrolled under a policy that's already on, so calling them here
    // would throw the very error this fixture is trying to set up for.
    const project = await prisma.project.create({ data: { clientId: mfaClient.id, name: "MFA Project" } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: "MFA Task" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: unenrolledOwner.id }, organizationId: mfaOrg.id });

    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("priority", "high");
    formData.set("clientId", mfaClient.id);
    formData.set("projectId", project.id);

    const result = await setTaskPriorityAction(formData);

    expect(result?.error).toBe("MFA enrollment is required for this account before this action can be performed.");

    getCurrentActor.mockResolvedValue({ user: { id: ownerUserId }, organizationId: orgId });
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.client.deleteMany({ where: { organizationId: mfaOrg.id } });
    await prisma.membership.deleteMany({ where: { organizationId: mfaOrg.id } });
    await prisma.user.deleteMany({ where: { id: unenrolledOwner.id } });
    await prisma.organization.deleteMany({ where: { id: mfaOrg.id } });
  });
});
