// Integration test for the Audit Log viewer (Bible Section 23.2/27).
// No server-only/next-headers mocks needed — audit-log-service.ts is a
// pure Prisma + @cedar/auth module, same shape as opportunity-service.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { listAuditEvents } from "./audit-log-service";

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
let ownerMembershipId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Audit Log Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({ data: { email: "audit-owner@test.example", name: "Owner", passwordHash: "irrelevant" } });
  ownerUserId = owner.id;
  const ownerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
  });
  ownerMembershipId = ownerMembership.id;

  const designer = await prisma.user.create({ data: { email: "audit-designer@test.example", name: "Designer", passwordHash: "irrelevant" } });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  const client = await prisma.client.create({ data: { organizationId: org.id, name: "Audit Client", companyName: "Inc", services: "[]" } });
  clientId = client.id;

  await emitAuditEvent({
    organizationId: orgId,
    actorType: "USER",
    actorId: ownerMembershipId,
    action: "client.created",
    resourceType: "Client",
    resourceId: clientId,
    clientId,
    result: "SUCCESS",
    changeSet: { name: "Audit Client" },
  });
  await emitAuditEvent({
    organizationId: orgId,
    actorType: "SYSTEM",
    action: "worker.job_failed",
    resourceType: "WorkerJob",
    resourceId: "job-1",
    result: "FAILURE",
  });
  await emitAuditEvent({
    organizationId: orgId,
    actorType: "AI_AGENT",
    actorId: "cedar-brain",
    action: "cedar_brain.request_denied",
    resourceType: "CedarBrainRequest",
    resourceId: "req-1",
    result: "DENIED",
  });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("listAuditEvents", () => {
  it("returns real audit events, newest first, with actor and client names resolved", async () => {
    const result = await listAuditEvents({ actorUserId: ownerUserId, organizationId: orgId });

    expect(result.totalCount).toBe(3);
    expect(result.entries).toHaveLength(3);
    // Newest first: the AI_AGENT event was emitted last.
    expect(result.entries[0]).toMatchObject({ action: "cedar_brain.request_denied", actorType: "AI_AGENT", actorLabel: "cedar-brain", result: "DENIED" });
    expect(result.entries[1]).toMatchObject({ action: "worker.job_failed", actorType: "SYSTEM", actorLabel: "System", result: "FAILURE" });
    expect(result.entries[2]).toMatchObject({ action: "client.created", actorType: "USER", actorLabel: "Owner", result: "SUCCESS", clientName: "Audit Client" });
  });

  it("filters by resourceType", async () => {
    const result = await listAuditEvents({ actorUserId: ownerUserId, organizationId: orgId, resourceType: "Client" });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].action).toBe("client.created");
  });

  it("rejects a member with no audit:read permission", async () => {
    await expect(listAuditEvents({ actorUserId: designerUserId, organizationId: orgId })).rejects.toThrow();
  });

  it("never leaks another organization's audit events", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Audit Org" } });
    const otherOwner = await prisma.user.create({ data: { email: "other-audit-owner@test.example", name: "Other Owner", passwordHash: "irrelevant" } });
    await prisma.membership.create({ data: { organizationId: otherOrg.id, userId: otherOwner.id, role: "OWNER", status: "ACTIVE" } });

    const result = await listAuditEvents({ actorUserId: otherOwner.id, organizationId: otherOrg.id });
    expect(result.entries).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});
