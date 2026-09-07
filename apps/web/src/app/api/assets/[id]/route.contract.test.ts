// API-contract test for DELETE /api/assets/[id]. Same process.cwd()
// monkeypatch + dynamic-import trick as
// clients/[id]/assets/route.contract.test.ts, since deleteAsset touches
// the real local storage adapter.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import type { DELETE as DeleteType } from "./route";

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
  await prisma.task.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.asset.deleteMany();
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
let testStorageDir: string;
let DELETE: typeof DeleteType;
const originalCwd = process.cwd;

async function createRealAsset(storageKey: string) {
  const filePath = path.join(testStorageDir, ".storage", storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "asset bytes");
  return prisma.asset.create({
    data: {
      organizationId: orgId,
      clientId,
      type: "image",
      filename: "delete-me.png",
      contentType: "image/png",
      storageKey,
      sizeBytes: 11,
      checksum: "irrelevant",
    },
  });
}

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Asset Delete Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "asset-delete-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "asset-delete-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Asset Delete Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;

  testStorageDir = await mkdtemp(path.join(tmpdir(), "cedar-asset-delete-route-test-"));
  process.cwd = () => testStorageDir;
  ({ DELETE } = await import("./route"));
});

afterAll(async () => {
  process.cwd = originalCwd;
  await rm(testStorageDir, { recursive: true, force: true });
  await wipeDatabase();
  await prisma.$disconnect();
});

function request() {
  return new Request("http://localhost/api/assets/x", { method: "DELETE" });
}

describe("DELETE /api/assets/[id]", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await DELETE(request(), { params: Promise.resolve({ id: "does-not-matter" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an asset that doesn't exist", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: "not-a-real-asset-id" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a member without clients:write", async () => {
    const asset = await createRealAsset("designer-check.png");
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: asset.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually deletes the database row and the file on disk", async () => {
    const asset = await createRealAsset("owner-delete.png");
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: asset.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(stored).toBeNull();

    const { readFile } = await import("node:fs/promises");
    await expect(readFile(path.join(testStorageDir, ".storage", asset.storageKey))).rejects.toThrow();
  });

  it("returns 404 for an asset from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });
    const otherAsset = await prisma.asset.create({
      data: {
        organizationId: otherOrg.id,
        clientId: otherClient.id,
        type: "image",
        filename: "other.png",
        contentType: "image/png",
        storageKey: "other.png",
        sizeBytes: 1,
        checksum: "x",
      },
    });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await DELETE(request(), { params: Promise.resolve({ id: otherAsset.id }) });
    expect(res.status).toBe(404);
  });
});
