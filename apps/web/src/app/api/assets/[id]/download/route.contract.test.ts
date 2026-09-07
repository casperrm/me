// API-contract test for GET /api/assets/[id]/download — deliberately
// the one asset route with NO session check (see the route's own
// comment and lib/storage/signed-url.ts): its entire contract is the
// signed token. Same process.cwd() monkeypatch + dynamic-import trick
// as the other asset routes, since it reads through the real local
// storage adapter.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { prisma } from "@cedar/db";
import type { GET as GetType } from "./route";

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
let clientId: string;
let assetId: string;
let storageKey: string;
let testStorageDir: string;
let GET: typeof GetType;
let buildSignedDownloadPath: (assetId: string, expiresInSeconds?: number) => string;
const originalCwd = process.cwd;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Asset Download Route Test Agency" } });
  orgId = org.id;
  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Asset Download Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;

  testStorageDir = await mkdtemp(path.join(tmpdir(), "cedar-asset-download-route-test-"));
  process.cwd = () => testStorageDir;

  storageKey = "download-me.png";
  const filePath = path.join(testStorageDir, ".storage", storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "real downloadable bytes");

  const asset = await prisma.asset.create({
    data: { organizationId: orgId, clientId, type: "image", filename: "download-me.png", contentType: "image/png", storageKey },
  });
  assetId = asset.id;

  ({ GET } = await import("./route"));
  ({ buildSignedDownloadPath } = await import("@/lib/storage"));
});

afterAll(async () => {
  process.cwd = originalCwd;
  await rm(testStorageDir, { recursive: true, force: true });
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("GET /api/assets/[id]/download", () => {
  it("returns 403 when the token is missing", async () => {
    const res = await GET(new Request(`http://localhost/api/assets/${assetId}/download`), { params: Promise.resolve({ id: assetId }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a wrong/tampered token", async () => {
    const res = await GET(new Request(`http://localhost/api/assets/${assetId}/download?token=not-a-real-token`), {
      params: Promise.resolve({ id: assetId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a valid token issued for a different asset id", async () => {
    const signedForOtherAsset = buildSignedDownloadPath("some-other-asset-id");
    const token = new URL(`http://localhost${signedForOtherAsset}`).searchParams.get("token")!;
    const res = await GET(new Request(`http://localhost/api/assets/${assetId}/download?token=${token}`), {
      params: Promise.resolve({ id: assetId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 200 with the real file bytes for a valid signed token", async () => {
    const signedPath = buildSignedDownloadPath(assetId);
    const token = new URL(`http://localhost${signedPath}`).searchParams.get("token")!;
    const res = await GET(new Request(`http://localhost/api/assets/${assetId}/download?token=${token}`), {
      params: Promise.resolve({ id: assetId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toContain("download-me.png");
    const bytes = await res.text();
    expect(bytes).toBe("real downloadable bytes");
  });

  it("returns 404 for a valid token but a since-deleted asset", async () => {
    const otherAsset = await prisma.asset.create({
      data: { organizationId: orgId, clientId, type: "image", filename: "temp.png", contentType: "image/png", storageKey: "temp.png" },
    });
    const signedPath = buildSignedDownloadPath(otherAsset.id);
    const token = new URL(`http://localhost${signedPath}`).searchParams.get("token")!;
    await prisma.asset.delete({ where: { id: otherAsset.id } });

    const res = await GET(new Request(`http://localhost/api/assets/${otherAsset.id}/download?token=${token}`), {
      params: Promise.resolve({ id: otherAsset.id }),
    });
    expect(res.status).toBe(404);
  });
});
