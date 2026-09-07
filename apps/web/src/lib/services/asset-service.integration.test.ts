// Integration test for the asset/storage service — see
// identity.integration.test.ts for why next/headers and server-only are
// mocked. Uses the real local filesystem adapter against a temp
// directory (not the app's actual .storage/) so this test never touches
// dev data or leaves files behind.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

let testStorageDir: string;

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.asset.deleteMany();
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
let taskId: string;

beforeAll(async () => {
  testStorageDir = await mkdtemp(path.join(tmpdir(), "cedar-asset-test-"));
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Asset Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "asset-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Asset Client", companyName: "Asset Co", services: "[]" },
  });
  clientId = client.id;

  const project = await prisma.project.create({ data: { clientId, name: "Asset Project" } });
  const task = await prisma.task.create({ data: { projectId: project.id, title: "Asset Task" } });
  taskId = task.id;
});

afterAll(async () => {
  await wipeDatabase();
  await rm(testStorageDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

// The real local-adapter writes under process.cwd()/.storage. Rather than
// mock the module (asset-service imports the shared singleton), point it
// at a throwaway directory for the duration of this file by overriding
// cwd — simplest way to keep the test hermetic without adding
// storage-backend injection to asset-service just for testing.
const originalCwd = process.cwd;

describe("uploadAsset / deleteAsset", () => {
  beforeAll(() => {
    process.cwd = () => testStorageDir;
  });
  afterAll(() => {
    process.cwd = originalCwd;
  });

  it("rejects a disallowed content type before touching storage or the database", async () => {
    const { uploadAsset, AssetValidationError } = await import("./asset-service");
    await expect(
      uploadAsset({
        actorUserId: ownerUserId,
        organizationId: orgId,
        clientId,
        filename: "notes.txt",
        contentType: "text/plain",
        data: Buffer.from("hello"),
      }),
    ).rejects.toThrow(AssetValidationError);

    expect(await prisma.asset.count()).toBe(0);
  });

  it("rejects an empty file", async () => {
    const { uploadAsset } = await import("./asset-service");
    await expect(
      uploadAsset({ actorUserId: ownerUserId, organizationId: orgId, clientId, filename: "empty.png", contentType: "image/png", data: Buffer.alloc(0) }),
    ).rejects.toThrow();
  });

  it("stores a valid upload, computes a checksum, and writes the file to disk", async () => {
    const { uploadAsset } = await import("./asset-service");
    const content = Buffer.from("fake-png-bytes");

    const asset = await uploadAsset({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      filename: "logo.png",
      contentType: "image/png",
      data: content,
    });

    expect(asset.status).toBe("AVAILABLE");
    expect(asset.checksum).toHaveLength(64); // sha256 hex
    expect(asset.sizeBytes).toBe(content.byteLength);

    const onDisk = await readFile(path.join(testStorageDir, ".storage", asset.storageKey));
    expect(onDisk.equals(content)).toBe(true);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "asset.uploaded", resourceId: asset.id } });
    expect(audit).toBeTruthy();
  });

  it("rejects an upload from a member with no clients:write on this client", async () => {
    const { uploadAsset } = await import("./asset-service");
    const designer = await prisma.user.create({
      data: { email: "asset-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: orgId, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

    await expect(
      uploadAsset({ actorUserId: designer.id, organizationId: orgId, clientId, filename: "x.png", contentType: "image/png", data: Buffer.from("x") }),
    ).rejects.toThrow();
  });

  it("deletes the asset row and the underlying file", async () => {
    const { uploadAsset, deleteAsset } = await import("./asset-service");
    const asset = await uploadAsset({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId,
      filename: "to-delete.png",
      contentType: "image/png",
      data: Buffer.from("temp"),
    });

    await deleteAsset({ actorUserId: ownerUserId, organizationId: orgId, assetId: asset.id });

    expect(await prisma.asset.findUnique({ where: { id: asset.id } })).toBeNull();
    await expect(readFile(path.join(testStorageDir, ".storage", asset.storageKey))).rejects.toThrow();
  });

  it("rejects deleting an asset from a different organization", async () => {
    const { uploadAsset, deleteAsset } = await import("./asset-service");
    const otherOrg = await prisma.organization.create({ data: { name: "Other Asset Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "Other Co", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "other-asset-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    const otherMembership = await prisma.membership.create({
      data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" },
    });

    const asset = await uploadAsset({
      actorUserId: otherOwner.id,
      organizationId: otherOrg.id,
      clientId: otherClient.id,
      filename: "other.png",
      contentType: "image/png",
      data: Buffer.from("other"),
    });

    await expect(
      deleteAsset({ actorUserId: ownerUserId, organizationId: orgId, assetId: asset.id }),
    ).rejects.toThrow(AuthError);

    await prisma.membership.delete({ where: { id: otherMembership.id } });
  });
});

describe("uploadTaskAttachment", () => {
  beforeAll(() => {
    process.cwd = () => testStorageDir;
  });
  afterAll(() => {
    process.cwd = originalCwd;
  });

  it("stores a valid upload scoped to the task, client, and project", async () => {
    const { uploadTaskAttachment } = await import("./asset-service");
    const content = Buffer.from("fake-pdf-bytes");

    const asset = await uploadTaskAttachment({
      actorUserId: ownerUserId,
      organizationId: orgId,
      taskId,
      filename: "brief.pdf",
      contentType: "application/pdf",
      data: content,
    });

    expect(asset.taskId).toBe(taskId);
    expect(asset.clientId).toBe(clientId);
    expect(asset.status).toBe("AVAILABLE");

    const onDisk = await readFile(path.join(testStorageDir, ".storage", asset.storageKey));
    expect(onDisk.equals(content)).toBe(true);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "task_attachment.uploaded", resourceId: asset.id } });
    expect(audit).toBeTruthy();
  });

  it("rejects a disallowed content type before touching storage", async () => {
    const { uploadTaskAttachment, AssetValidationError } = await import("./asset-service");
    await expect(
      uploadTaskAttachment({
        actorUserId: ownerUserId,
        organizationId: orgId,
        taskId,
        filename: "notes.txt",
        contentType: "text/plain",
        data: Buffer.from("hello"),
      }),
    ).rejects.toThrow(AssetValidationError);
  });

  it("rejects an upload from a member with no clients:write on the task's client", async () => {
    const { uploadTaskAttachment } = await import("./asset-service");
    const designer = await prisma.user.create({
      data: { email: "asset-task-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: orgId, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

    await expect(
      uploadTaskAttachment({ actorUserId: designer.id, organizationId: orgId, taskId, filename: "x.png", contentType: "image/png", data: Buffer.from("x") }),
    ).rejects.toThrow();
  });

  it("rejects a task from a different organization", async () => {
    const { uploadTaskAttachment } = await import("./asset-service");
    const otherOrg = await prisma.organization.create({ data: { name: "Other Asset Task Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "Other Co", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "other-asset-task-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Project" } });
    const otherTask = await prisma.task.create({ data: { projectId: otherProject.id, title: "Other Task" } });

    await expect(
      uploadTaskAttachment({ actorUserId: ownerUserId, organizationId: orgId, taskId: otherTask.id, filename: "x.png", contentType: "image/png", data: Buffer.from("x") }),
    ).rejects.toThrow(AuthError);
  });
});
