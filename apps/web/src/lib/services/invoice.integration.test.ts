// Integration test for the invoice write path (Bible Section 16 Finance
// Hub). See identity.integration.test.ts for why next/headers and
// server-only are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { createInvoice, markInvoicePaid, sendInvoice } from "./invoice-service";

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
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Invoice Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "invoice-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Invoice Client", companyName: "Inc", services: "[]" },
  });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createInvoice", () => {
  it("rejects a non-positive amount", async () => {
    await expect(
      createInvoice({ actorUserId: ownerUserId, organizationId: orgId, clientId, amountCents: 0 }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a client from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    await expect(
      createInvoice({ actorUserId: ownerUserId, organizationId: orgId, clientId: otherClient.id, amountCents: 5000 }),
    ).rejects.toThrow(AuthError);
  });

  it("creates a draft invoice and a timeline event", async () => {
    const invoice = await createInvoice({ actorUserId: ownerUserId, organizationId: orgId, clientId, amountCents: 10000 });
    expect(invoice.status).toBe("DRAFT");

    const timeline = await prisma.clientTimelineEvent.findFirst({ where: { clientId, type: "invoice_created" } });
    expect(timeline).toBeTruthy();
  });
});

describe("sendInvoice / markInvoicePaid", () => {
  it("only allows sending a draft invoice, and only allows marking a sent invoice paid", async () => {
    const invoice = await createInvoice({ actorUserId: ownerUserId, organizationId: orgId, clientId, amountCents: 20000 });

    // Can't mark paid before it's sent.
    await expect(
      markInvoicePaid({ actorUserId: ownerUserId, organizationId: orgId, invoiceId: invoice.id }),
    ).rejects.toThrow(AuthError);

    const sent = await sendInvoice({ actorUserId: ownerUserId, organizationId: orgId, invoiceId: invoice.id });
    expect(sent.status).toBe("SENT");

    // Can't send it again.
    await expect(
      sendInvoice({ actorUserId: ownerUserId, organizationId: orgId, invoiceId: invoice.id }),
    ).rejects.toThrow(AuthError);

    const paid = await markInvoicePaid({ actorUserId: ownerUserId, organizationId: orgId, invoiceId: invoice.id });
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).not.toBeNull();

    const sentEvent = await prisma.clientTimelineEvent.findFirst({ where: { clientId, type: "invoice_sent" } });
    const paidEvent = await prisma.clientTimelineEvent.findFirst({ where: { clientId, type: "invoice_paid" } });
    expect(sentEvent).toBeTruthy();
    expect(paidEvent).toBeTruthy();
  });

  it("rejects an invoice from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org 2" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client 2", companyName: "Y", services: "[]" },
    });
    const otherOwner = await prisma.user.create({
      data: { email: "other-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" },
    });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });
    const otherInvoice = await prisma.invoice.create({ data: { clientId: otherClient.id, amountCents: 1000, status: "DRAFT" } });

    await expect(
      sendInvoice({ actorUserId: ownerUserId, organizationId: orgId, invoiceId: otherInvoice.id }),
    ).rejects.toThrow(AuthError);
  });
});
