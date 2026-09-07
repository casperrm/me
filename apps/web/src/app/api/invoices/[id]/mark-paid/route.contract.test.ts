// API-contract test for POST /api/invoices/[id]/mark-paid. See
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
  const org = await prisma.organization.create({ data: { name: "Invoice Mark-Paid Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "invoice-paid-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "invoice-paid-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Invoice Mark-Paid Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request() {
  return new Request("http://localhost/api/invoices/x/mark-paid", { method: "POST" });
}

describe("POST /api/invoices/[id]/mark-paid", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request(), { params: Promise.resolve({ id: "does-not-matter" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without finance:write", async () => {
    const invoice = await prisma.invoice.create({ data: { clientId, amountCents: 10000, status: "SENT" } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: invoice.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 with the real service's message when the invoice hasn't been sent yet", async () => {
    const invoice = await prisma.invoice.create({ data: { clientId, amountCents: 20000, status: "DRAFT" } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: invoice.id }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only a sent invoice/i);
  });

  it("returns 200 and actually transitions a real sent invoice to PAID with a real paidAt", async () => {
    const invoice = await prisma.invoice.create({ data: { clientId, amountCents: 30000, status: "SENT" } });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: invoice.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const stored = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(stored?.status).toBe("PAID");
    expect(stored?.paidAt).not.toBeNull();

    const timeline = await prisma.clientTimelineEvent.findFirst({ where: { clientId, type: "invoice_paid" } });
    expect(timeline).toBeTruthy();
  });

  it("returns 400 for an invoice from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });
    const otherInvoice = await prisma.invoice.create({ data: { clientId: otherClient.id, amountCents: 5000, status: "SENT" } });

    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request(), { params: Promise.resolve({ id: otherInvoice.id }) });
    expect(res.status).toBe(400);
  });
});
