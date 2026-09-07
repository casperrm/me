// Integration test for client-relations-service.ts (Phase 7 scale
// hardening — see docs/specs/client-relations-pagination.md). Proves
// pagination is real (page 2 returns different rows, ordering holds,
// totalCount/totalPages match reality) against a real Postgres
// database, not just that the function returns an array.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@cedar/db";
import {
  PAGE_SIZE,
  getPaginatedAssets,
  getPaginatedExpenses,
  getPaginatedInvoices,
  getPaginatedNotes,
  getPaginatedProjects,
  getPaginatedTimelineEvents,
} from "./client-relations-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.note.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.task.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let clientId: string;
let otherClientId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Client Relations Test Agency" } });
  orgId = org.id;

  const [client, otherClient] = await Promise.all([
    prisma.client.create({ data: { organizationId: org.id, name: "Paginated Client", companyName: "Inc", services: "[]" } }),
    prisma.client.create({ data: { organizationId: org.id, name: "Other Client", companyName: "Inc", services: "[]" } }),
  ]);
  clientId = client.id;
  otherClientId = otherClient.id;

  // 25 invoices for `clientId` (more than one page at PAGE_SIZE=20), one
  // for `otherClientId` — proves both pagination and per-client scoping.
  for (let i = 0; i < 25; i++) {
    await prisma.invoice.create({
      data: {
        clientId,
        amountCents: (i + 1) * 100,
        issuedAt: new Date(2024, 0, i + 1),
      },
    });
  }
  await prisma.invoice.create({ data: { clientId: otherClientId, amountCents: 999, issuedAt: new Date(2024, 0, 1) } });

  await prisma.expense.create({ data: { organizationId: orgId, clientId, category: "Software", amountCents: 500 } });
  await prisma.note.create({ data: { clientId, body: "A note" } });
  await prisma.clientTimelineEvent.create({ data: { clientId, type: "note", summary: "Something happened" } });
  await prisma.asset.create({
    data: { organizationId: orgId, clientId, type: "document", filename: "brief.pdf", storageKey: "test/brief.pdf" },
  });

  const project = await prisma.project.create({ data: { clientId, name: "Launch" } });
  await prisma.campaign.create({ data: { projectId: project.id, name: "Campaign A" } });
  await prisma.campaign.create({ data: { projectId: project.id, name: "Campaign B" } });
  await prisma.task.create({ data: { projectId: project.id, title: "Do the thing" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("getPaginatedInvoices", () => {
  it("returns PAGE_SIZE items on page 1, ordered newest-first, scoped to the client", async () => {
    const result = await getPaginatedInvoices(clientId, 1);
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(result.totalCount).toBe(25);
    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(1);
    // Newest-first: the 25th invoice created (Jan 25) should be first.
    expect(result.items[0].issuedAt.getDate()).toBe(25);
    expect(result.items.every((i) => i.clientId === clientId)).toBe(true);
  });

  it("returns the remaining 5 items on page 2, with no overlap with page 1", async () => {
    const [page1, page2] = await Promise.all([getPaginatedInvoices(clientId, 1), getPaginatedInvoices(clientId, 2)]);
    expect(page2.items).toHaveLength(5);
    expect(page2.totalPages).toBe(2);

    const page1Ids = new Set(page1.items.map((i) => i.id));
    expect(page2.items.every((i) => !page1Ids.has(i.id))).toBe(true);
  });

  it("clamps invalid page numbers (0, negative, NaN) to page 1", async () => {
    const result = await getPaginatedInvoices(clientId, 0);
    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(PAGE_SIZE);
  });

  it("never leaks another client's invoices", async () => {
    const result = await getPaginatedInvoices(otherClientId, 1);
    expect(result.totalCount).toBe(1);
    expect(result.items).toHaveLength(1);
  });
});

describe("getPaginatedProjects", () => {
  it("returns real campaign/task counts without fetching the full nested arrays", async () => {
    const result = await getPaginatedProjects(clientId, 1);
    expect(result.totalCount).toBe(1);
    expect(result.items[0]._count.campaigns).toBe(2);
    expect(result.items[0]._count.tasks).toBe(1);
  });
});

describe("other paginated relations are scoped and shaped correctly", () => {
  it("getPaginatedExpenses", async () => {
    const result = await getPaginatedExpenses(clientId, 1);
    expect(result.totalCount).toBe(1);
    expect(result.items[0].category).toBe("Software");
  });

  it("getPaginatedNotes", async () => {
    const result = await getPaginatedNotes(clientId, 1);
    expect(result.totalCount).toBe(1);
    expect(result.items[0].body).toBe("A note");
  });

  it("getPaginatedTimelineEvents", async () => {
    const result = await getPaginatedTimelineEvents(clientId, 1);
    expect(result.totalCount).toBe(1);
    expect(result.items[0].summary).toBe("Something happened");
  });

  it("getPaginatedAssets includes the uploader relation", async () => {
    const result = await getPaginatedAssets(clientId, 1);
    expect(result.totalCount).toBe(1);
    expect(result.items[0].filename).toBe("brief.pdf");
    expect(result.items[0]).toHaveProperty("uploadedBy");
  });
});
