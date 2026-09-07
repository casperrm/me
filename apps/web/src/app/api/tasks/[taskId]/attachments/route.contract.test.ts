// API-contract test for POST /api/tasks/[taskId]/attachments — takes
// multipart FormData and writes to the real local storage adapter (not
// mocked). Same process.cwd() monkeypatch + dynamic-import trick as
// asset-service.integration.test.ts, so this test never touches the
// app's real .storage/ directory — see that file's comment for why.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import type { POST as PostType } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.qualityCheckResult.deleteMany();
  await prisma.videoBriefVersion.deleteMany();
  await prisma.videoBrief.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.shoot.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.taskChecklistItem.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.task.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.clientHealthScore.deleteMany();
  await prisma.note.deleteMany();
  await prisma.project.deleteMany();
  await prisma.brandProfileVersion.deleteMany();
  await prisma.brandProfile.deleteMany();
  await prisma.connectionEvent.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;
let taskId: string;
let testStorageDir: string;
let POST: typeof PostType;
const originalCwd = process.cwd;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Task Attachment Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "task-attach-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "task-attach-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Task Attachment Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
  const project = await prisma.project.create({ data: { clientId, name: "Task Attachment Project" } });
  const task = await prisma.task.create({ data: { projectId: project.id, title: "Task Attachment Task" } });
  taskId = task.id;

  testStorageDir = await mkdtemp(path.join(tmpdir(), "cedar-task-attachment-route-test-"));
  process.cwd = () => testStorageDir;
  ({ POST } = await import("./route"));
});

afterAll(async () => {
  process.cwd = originalCwd;
  await rm(testStorageDir, { recursive: true, force: true });
  await wipeDatabase();
  await prisma.$disconnect();
});

function requestWithFile(file: File | null) {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return new Request("http://localhost/api/tasks/x/attachments", { method: "POST", body: formData });
}

describe("POST /api/tasks/[taskId]/attachments", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(requestWithFile(new File(["x"], "a.png", { type: "image/png" })), { params: Promise.resolve({ taskId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is present in the form data", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(requestWithFile(null), { params: Promise.resolve({ taskId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(requestWithFile(new File(["x"], "a.png", { type: "image/png" })), { params: Promise.resolve({ taskId }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 with the real service's message for a disallowed content type", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(requestWithFile(new File(["x"], "a.exe", { type: "application/x-msdownload" })), {
      params: Promise.resolve({ taskId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("returns 200 and actually persists a real asset row scoped to the task", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(requestWithFile(new File(["real pdf bytes"], "brief.pdf", { type: "application/pdf" })), {
      params: Promise.resolve({ taskId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, assetId: expect.any(String) });

    const stored = await prisma.asset.findUnique({ where: { id: body.assetId } });
    expect(stored).toMatchObject({ taskId, clientId, filename: "brief.pdf", contentType: "application/pdf" });

    const { readFile } = await import("node:fs/promises");
    const onDisk = await readFile(path.join(testStorageDir, ".storage", stored!.storageKey));
    expect(onDisk.toString()).toBe("real pdf bytes");
  });

  it("returns 400 for a task in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherTask = await prisma.task.create({ data: { projectId: otherProject.id, title: "Other Task" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(requestWithFile(new File(["x"], "a.png", { type: "image/png" })), { params: Promise.resolve({ taskId: otherTask.id }) });
    expect(res.status).toBe(400);
  });
});
