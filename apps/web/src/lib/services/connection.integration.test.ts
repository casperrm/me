// Integration test for the Integration Center's real connector (Bible
// Section 17.1/34). See identity.integration.test.ts for why next/headers
// and server-only are mocked.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";
import { createGenericWebhookConnection, listConnections, receiveWebhookEvent, revokeConnection } from "./connection-service";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.connectionEvent.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Integration Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "int-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "int-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("createGenericWebhookConnection", () => {
  it("rejects a member without organization:manage", async () => {
    await expect(
      createGenericWebhookConnection({ actorUserId: designerUserId, organizationId: orgId, name: "Should fail" }),
    ).rejects.toThrow();
  });

  it("rejects an empty name", async () => {
    await expect(
      createGenericWebhookConnection({ actorUserId: ownerUserId, organizationId: orgId, name: "  " }),
    ).rejects.toThrow(AuthError);
  });

  it("creates a connection with a real signing secret returned exactly once", async () => {
    const { connectionId, signingSecret } = await createGenericWebhookConnection({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Zapier — lead form",
    });
    expect(connectionId).toBeTruthy();
    expect(signingSecret).toHaveLength(64); // 32 random bytes, hex-encoded

    const stored = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(stored.signingSecretEncrypted).not.toBe(signingSecret); // encrypted at rest, never plaintext
    expect(stored.status).toBe("CONNECTED");
  });
});

describe("receiveWebhookEvent", () => {
  it("accepts a correctly signed event and records it", async () => {
    const { connectionId, signingSecret } = await createGenericWebhookConnection({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Webhook A",
    });

    const body = JSON.stringify({ id: "evt_1", type: "lead.created" });
    const signature = sign(signingSecret, body);

    const results = await receiveWebhookEvent({
      connectionId,
      headers: { "x-cedar-signature": signature },
      rawBody: body,
    });
    expect(results).toEqual([{ idempotencyKey: "evt_1", deduped: false }]);

    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.eventCount).toBe(1);
    expect(connection.lastEventAt).not.toBeNull();
  });

  it("rejects a badly signed event", async () => {
    const { connectionId } = await createGenericWebhookConnection({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Webhook B",
    });

    await expect(
      receiveWebhookEvent({ connectionId, headers: { "x-cedar-signature": "wrong" }, rawBody: "{}" }),
    ).rejects.toThrow();
  });

  it("dedupes a replayed event by idempotency key instead of double-counting", async () => {
    const { connectionId, signingSecret } = await createGenericWebhookConnection({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Webhook C",
    });

    const body = JSON.stringify({ id: "evt_replay", type: "ping" });
    const signature = sign(signingSecret, body);

    const first = await receiveWebhookEvent({ connectionId, headers: { "x-cedar-signature": signature }, rawBody: body });
    const second = await receiveWebhookEvent({ connectionId, headers: { "x-cedar-signature": signature }, rawBody: body });

    expect(first).toEqual([{ idempotencyKey: "evt_replay", deduped: false }]);
    expect(second).toEqual([{ idempotencyKey: "evt_replay", deduped: true }]);

    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.eventCount).toBe(1); // not incremented on the deduped replay
  });

  it("rejects an event for a revoked connection", async () => {
    const { connectionId, signingSecret } = await createGenericWebhookConnection({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Webhook D",
    });
    await revokeConnection({ actorUserId: ownerUserId, organizationId: orgId, connectionId });

    const body = JSON.stringify({ type: "ping" });
    const signature = sign(signingSecret, body);
    await expect(
      receiveWebhookEvent({ connectionId, headers: { "x-cedar-signature": signature }, rawBody: body }),
    ).rejects.toThrow(AuthError);
  });
});

describe("listConnections / revokeConnection", () => {
  it("lists connections scoped to the organization, with real health status", async () => {
    const connections = await listConnections(orgId);
    expect(connections.length).toBeGreaterThan(0);
    expect(connections.every((c) => c.provider === "generic_webhook")).toBe(true);
  });

  it("rejects revoking a connection from a different organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const { connectionId } = await createGenericWebhookConnection({
      actorUserId: ownerUserId,
      organizationId: orgId,
      name: "Cross-org test",
    });

    // ownerUserId has no membership in otherOrg at all, so requirePermission
    // itself rejects (AuthorizationError) before the cross-tenant
    // connection lookup would even run — either way, the write is refused.
    await expect(
      revokeConnection({ actorUserId: ownerUserId, organizationId: otherOrg.id, connectionId }),
    ).rejects.toThrow();
  });
});
