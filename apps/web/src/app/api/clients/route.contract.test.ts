// API-contract test for POST /api/clients. See
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
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "New Client Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "new-client-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "new-client-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/clients", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ name: "Volt Mobile", companyName: "Volt Mobile Inc" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ companyName: "Volt Mobile Inc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyName is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ name: "Volt Mobile" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without clients:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ name: "Volt Mobile", companyName: "Volt Mobile Inc" }));
    expect(res.status).toBe(403);
  });

  it("returns 200 and actually persists a real client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(
      request({
        name: "Volt Mobile",
        companyName: "Volt Mobile Inc",
        industry: "Telecom",
        lifecycleStage: "PROSPECT",
        primaryContactName: "Jamie Rivera",
        primaryContactEmail: "jamie@voltmobile.example",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, clientId: expect.any(String) });

    const stored = await prisma.client.findUnique({ where: { id: body.clientId } });
    expect(stored).toMatchObject({
      organizationId: orgId,
      name: "Volt Mobile",
      companyName: "Volt Mobile Inc",
      industry: "Telecom",
      lifecycleStage: "PROSPECT",
      primaryContactName: "Jamie Rivera",
      primaryContactEmail: "jamie@voltmobile.example",
    });

    const auditEvent = await prisma.auditEvent.findFirst({ where: { resourceId: body.clientId, action: "client.created" } });
    expect(auditEvent).not.toBeNull();
  });

  it("defaults lifecycleStage to ACTIVE when omitted", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ name: "Minimal Co", companyName: "Minimal Co LLC" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const stored = await prisma.client.findUnique({ where: { id: body.clientId } });
    expect(stored?.lifecycleStage).toBe("ACTIVE");
  });

  it("returns 400 for an invalid lifecycleStage", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ name: "Bad Stage Co", companyName: "Bad Stage LLC", lifecycleStage: "NOT_REAL" }));
    expect(res.status).toBe(400);
  });
});
