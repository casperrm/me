// Integration test for client note creation (Section 4) against real
// Postgres. Before this slice, prisma.note.create was never called
// outside seed/test fixtures — the /clients/[id]/notes page and the
// client detail page's Notes card were both read-only.
//
// server-only/next-headers mocked — see identity.integration.test.ts for
// why (transitively pulled in via auth-service.ts's AuthError, which
// note-service.ts imports).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { createNote } from "./note-service";
import { AuthError } from "./auth-service";

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

  const org = await prisma.organization.create({ data: { name: "Note Creation Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "create-note-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "create-note-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Note Test Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createNote", () => {
  it("creates a real note with a real audit event", async () => {
    const note = await createNote({ actorUserId: ownerUserId, organizationId: orgId, clientId, body: "Kickoff call went well." });
    expect(note).toMatchObject({ clientId, body: "Kickoff call went well." });

    const audit = await prisma.auditEvent.findFirst({ where: { action: "note.created", resourceId: note.id } });
    expect(audit).toMatchObject({ resourceType: "Note", clientId, result: "SUCCESS" });
  });

  it("rejects an empty note body", async () => {
    await expect(createNote({ actorUserId: ownerUserId, organizationId: orgId, clientId, body: "   " })).rejects.toThrow(AuthError);
  });

  it("rejects a member with no clients:write for this client", async () => {
    await expect(
      createNote({ actorUserId: designerUserId, organizationId: orgId, clientId, body: "Should fail" }),
    ).rejects.toThrow();
  });

  it("rejects a client from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Note Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });

    await expect(
      createNote({ actorUserId: ownerUserId, organizationId: orgId, clientId: otherClient.id, body: "Nope" }),
    ).rejects.toThrow(AuthError);
  });
});
