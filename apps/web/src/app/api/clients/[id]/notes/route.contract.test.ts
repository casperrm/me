// API-contract test for POST /api/clients/[id]/notes. See
// apps/web/src/app/api/clients/[id]/projects/route.contract.test.ts for
// the pattern this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.note.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Note Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "note-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "note-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Note Route Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/clients/x/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/clients/[id]/notes", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ body: "A note" }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ body: "Should fail" }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists a real note", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ body: "Renewal discussion scheduled." }), { params: Promise.resolve({ id: clientId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, noteId: expect.any(String) });

    const stored = await prisma.note.findUnique({ where: { id: body.noteId } });
    expect(stored).toMatchObject({ clientId, body: "Renewal discussion scheduled." });
  });

  it("returns 400 for a client in a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Note Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ body: "Nope" }), { params: Promise.resolve({ id: otherClient.id }) });
    expect(res.status).toBe(400);
  });
});
