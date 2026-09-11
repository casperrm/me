// Integration test for client creation and editing (Section 4) against
// real Postgres. Before the creation slice, prisma.client.create was only
// ever called from packages/db/prisma/seed.ts and test fixtures. Before
// the editing slice, there was no update path at all — the field-level
// scope boundary named in docs/specs/client-creation.md ("no
// client-editing UI") as its own explicit follow-up.
//
// server-only/next-headers mocked — see identity.integration.test.ts for
// why (transitively pulled in via auth-service.ts's AuthError, which
// client-service.ts imports).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { createClient, updateClient } from "./client-service";
import { AuthError } from "./auth-service";

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
let scopedUserId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Client Creation Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "create-client-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({ data: { email: "create-client-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  // A DESIGNER with an explicit org-wide (clientId: null) ScopedGrant for
  // clients:write should be able to create a client too — same tier `can()`
  // already grants project-template creation and other "brand new resource"
  // writes.
  const scopedDesigner = await prisma.user.create({ data: { email: "create-client-scoped@test.example", name: "Scoped Designer", passwordHash: "irrelevant" } });
  scopedUserId = scopedDesigner.id;
  const scopedMembership = await prisma.membership.create({ data: { organizationId: org.id, userId: scopedDesigner.id, role: "DESIGNER", status: "ACTIVE" } });
  await prisma.scopedGrant.create({ data: { membershipId: scopedMembership.id, permission: "clients:write", clientId: null } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("createClient", () => {
  it("creates a real client with a real audit event", async () => {
    const client = await createClient({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Volt Mobile",
      companyName: "Volt Mobile Inc",
      industry: "Telecom",
      lifecycleStage: "PROSPECT",
      primaryContactName: "Jamie Rivera",
      primaryContactEmail: "jamie@voltmobile.example",
    });

    expect(client).toMatchObject({
      organizationId: orgId,
      name: "Volt Mobile",
      companyName: "Volt Mobile Inc",
      industry: "Telecom",
      lifecycleStage: "PROSPECT",
      primaryContactName: "Jamie Rivera",
      primaryContactEmail: "jamie@voltmobile.example",
      services: "[]",
    });

    const audit = await prisma.auditEvent.findFirst({ where: { action: "client.created", resourceId: client.id } });
    expect(audit).toMatchObject({ resourceType: "Client", clientId: client.id, result: "SUCCESS" });
  });

  it("defaults lifecycleStage to ACTIVE and services to an empty array when omitted", async () => {
    const client = await createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "Minimal Co", companyName: "Minimal Co LLC" });
    expect(client.lifecycleStage).toBe("ACTIVE");
    expect(client.services).toBe("[]");
    expect(client.industry).toBeNull();
  });

  it("rejects an empty name or companyName", async () => {
    await expect(createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "   ", companyName: "Real Co" })).rejects.toThrow(AuthError);
    await expect(createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "Real Name", companyName: "   " })).rejects.toThrow(AuthError);
  });

  it("rejects an invalid lifecycleStage", async () => {
    await expect(
      createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "Bad Stage Co", companyName: "Bad Stage LLC", lifecycleStage: "NOT_REAL" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a member with no org-wide clients:write", async () => {
    await expect(
      createClient({ actorUserId: designerUserId, organizationId: orgId, name: "Should Fail Co", companyName: "Should Fail LLC" }),
    ).rejects.toThrow();
  });

  it("allows a member with an explicit org-wide clients:write ScopedGrant", async () => {
    const client = await createClient({ actorUserId: scopedUserId, organizationId: orgId, name: "Scoped Grant Co", companyName: "Scoped Grant LLC" });
    expect(client.name).toBe("Scoped Grant Co");
  });
});

describe("updateClient", () => {
  it("updates only the fields provided and records a before/after audit event", async () => {
    const client = await createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "Edit Target Co", companyName: "Edit Target LLC" });

    const updated = await updateClient({
      actorUserId: ownerUserId,
      organizationId: orgId,
      clientId: client.id,
      name: "Edit Target Co (Renamed)",
      lifecycleStage: "PAUSED",
    });

    expect(updated).toMatchObject({ name: "Edit Target Co (Renamed)", lifecycleStage: "PAUSED", companyName: "Edit Target LLC" });

    const audit = await prisma.auditEvent.findFirst({ where: { action: "client.updated", resourceId: client.id } });
    expect(audit).toMatchObject({ resourceType: "Client", clientId: client.id, result: "SUCCESS" });
    const changeSet = JSON.parse(audit!.changeSet!) as { before: Record<string, unknown>; after: Record<string, unknown> };
    expect(changeSet.before).toMatchObject({ name: "Edit Target Co", lifecycleStage: "ACTIVE" });
    expect(changeSet.after).toMatchObject({ name: "Edit Target Co (Renamed)", lifecycleStage: "PAUSED" });
  });

  it("clears an optional field to null when given an empty string", async () => {
    const client = await createClient({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Clearable Co",
      companyName: "Clearable LLC",
      industry: "Retail",
    });
    const updated = await updateClient({ actorUserId: ownerUserId, organizationId: orgId, clientId: client.id, industry: "" });
    expect(updated.industry).toBeNull();
  });

  it("does not emit an audit event when nothing actually changed", async () => {
    const client = await createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "No-op Co", companyName: "No-op LLC" });
    await updateClient({ actorUserId: ownerUserId, organizationId: orgId, clientId: client.id, name: "No-op Co" });
    const auditCount = await prisma.auditEvent.count({ where: { action: "client.updated", resourceId: client.id } });
    expect(auditCount).toBe(0);
  });

  it("rejects when no fields are provided", async () => {
    const client = await createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "Empty Update Co", companyName: "Empty Update LLC" });
    await expect(updateClient({ actorUserId: ownerUserId, organizationId: orgId, clientId: client.id })).rejects.toThrow(AuthError);
  });

  it("rejects an invalid lifecycleStage", async () => {
    const client = await createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "Bad Edit Co", companyName: "Bad Edit LLC" });
    await expect(
      updateClient({ actorUserId: ownerUserId, organizationId: orgId, clientId: client.id, lifecycleStage: "NOT_REAL" }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a member with no clients:write for this client", async () => {
    const client = await createClient({ actorUserId: ownerUserId, organizationId: orgId, name: "Guarded Co", companyName: "Guarded LLC" });
    await expect(
      updateClient({ actorUserId: designerUserId, organizationId: orgId, clientId: client.id, name: "Hijacked" }),
    ).rejects.toThrow();
  });

  it("rejects a client from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Client Edit Org" } });
    const otherClient = await prisma.client.create({ data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" } });

    await expect(
      updateClient({ actorUserId: ownerUserId, organizationId: orgId, clientId: otherClient.id, name: "Hijacked" }),
    ).rejects.toThrow(AuthError);
  });
});
