// API-contract test for POST /api/invoices. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let clientId: string;
let projectId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Invoice Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "invoice-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });
  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Route Test Client", companyName: "Inc", services: "[]" },
  });
  clientId = client.id;

  const project = await prisma.project.create({ data: { clientId: client.id, name: "Route Test Project" } });
  projectId = project.id;

  const designer = await prisma.user.create({
    data: { email: "invoice-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invoices", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ clientId, amountCents: 1000 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when amountCents is 0 rather than misreporting it as missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ clientId, amountCents: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive/i);
  });

  it("returns 403 for a member without finance:write", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ clientId, amountCents: 5000 }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 200 with a real invoiceId and persists a DRAFT invoice", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ clientId, amountCents: 10000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, invoiceId: expect.any(String) });

    const stored = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    expect(stored).toMatchObject({ status: "DRAFT", amountCents: 10000, clientId });
  });

  it("persists a projectId when given, and rejects one from a different client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ clientId, projectId, amountCents: 12000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const stored = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    expect(stored?.projectId).toBe(projectId);

    const otherClient = await prisma.client.create({
      data: { organizationId: orgId, name: "Other Route Client", companyName: "X", services: "[]" },
    });
    const otherProject = await prisma.project.create({ data: { clientId: otherClient.id, name: "Other Client Project" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const rejected = await POST(request({ clientId, projectId: otherProject.id, amountCents: 12000 }));
    expect(rejected.status).toBe(400);
  });
});
