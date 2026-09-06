// API-contract test for POST /api/integrations/webhooks/[id] — the one
// route in this app deliberately NOT session-authenticated (an external
// tool has no Cedar Point OS session). Its contract is entirely about
// the HMAC signature, not @/lib/current-actor, so this test needs none
// of the getCurrentActor mocking the other route.contract.test.ts files
// use.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));
import { prisma } from "@cedar/db";
import { createGenericWebhookConnection } from "@/lib/services/connection-service";
import { POST } from "./route";

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
let connectionId: string;
let signingSecret: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Webhook Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "webhook-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const created = await createGenericWebhookConnection({ actorUserId: ownerUserId, organizationId: orgId, name: "Route test" });
  connectionId = created.connectionId;
  signingSecret = created.signingSecret;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function sign(body: string): string {
  return createHmac("sha256", signingSecret).update(body).digest("hex");
}

function makeRequest(id: string, body: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-cedar-signature"] = signature;
  return POST(new Request(`http://localhost/api/integrations/webhooks/${id}`, { method: "POST", headers, body }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/integrations/webhooks/[id]", () => {
  it("returns 401 with no signature header", async () => {
    const res = await makeRequest(connectionId, "{}");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 401 for a wrong signature", async () => {
    const res = await makeRequest(connectionId, "{}", "0".repeat(64));
    expect(res.status).toBe(401);
  });

  it("returns 200 and the real deduped:false result for a correctly signed event", async () => {
    const payload = JSON.stringify({ id: "evt_route_1", type: "ping" });
    const res = await makeRequest(connectionId, payload, sign(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, events: [{ idempotencyKey: "evt_route_1", deduped: false }] });
  });

  it("returns 200 with deduped:true on an exact replay, not a second success", async () => {
    const payload = JSON.stringify({ id: "evt_route_1", type: "ping" });
    const res = await makeRequest(connectionId, payload, sign(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0].deduped).toBe(true);
  });

  it("returns 400 for a connection id that doesn't exist", async () => {
    const payload = JSON.stringify({ type: "ping" });
    const res = await makeRequest("00000000-0000-0000-0000-000000000000", payload, sign(payload));
    expect(res.status).toBe(400);
  });
});
