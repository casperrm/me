// API-contract test for GET /api/clients/[id]/assets/search. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { GET } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;
let otherClientId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Asset Search Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "asset-search-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "asset-search-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Asset Search Client", companyName: "Inc", services: "[]" },
  });
  clientId = client.id;
  const otherClient = await prisma.client.create({
    data: { organizationId: org.id, name: "Other Client", companyName: "Inc", services: "[]" },
  });
  otherClientId = otherClient.id;

  await prisma.asset.createMany({
    data: [
      { organizationId: orgId, clientId, type: "image", filename: "brand-logo.png", storageKey: "k1", status: "AVAILABLE" },
      { organizationId: orgId, clientId, type: "document", filename: "media-kit.pdf", storageKey: "k2", status: "AVAILABLE" },
      { organizationId: orgId, clientId, type: "image", filename: "old-draft.png", storageKey: "k3", status: "REJECTED" },
      { organizationId: orgId, clientId: otherClientId, filename: "logo-other-client.png", type: "image", storageKey: "k4", status: "AVAILABLE" },
    ],
  });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(url: string) {
  return new Request(url, { method: "GET" });
}

describe("GET /api/clients/[id]/assets/search", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await GET(request("http://localhost/x"), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without clients:read on this client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await GET(request("http://localhost/x"), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(403);
  });

  it("returns real matches filtered by filename, scoped to the client, excluding non-AVAILABLE assets", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await GET(request("http://localhost/x?q=logo"), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assets).toEqual([{ id: expect.any(String), filename: "brand-logo.png" }]);
  });

  it("returns the most recent files for a blank query, not an error", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await GET(request("http://localhost/x"), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const filenames = body.assets.map((a: { filename: string }) => a.filename).sort();
    expect(filenames).toEqual(["brand-logo.png", "media-kit.pdf"]);
  });

  it("never returns another client's assets even with a matching query", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await GET(request("http://localhost/x?q=logo"), { params: Promise.resolve({ id: clientId }) });
    const body = await res.json();
    expect(body.assets.some((a: { filename: string }) => a.filename === "logo-other-client.png")).toBe(false);
  });
});
