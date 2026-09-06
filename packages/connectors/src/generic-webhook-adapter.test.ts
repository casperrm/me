import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GenericWebhookAdapter, type GenericWebhookConnection } from "./generic-webhook-adapter";

const adapter = new GenericWebhookAdapter();

function connection(overrides: Partial<GenericWebhookConnection> = {}): GenericWebhookConnection {
  return {
    id: "conn-1",
    organizationId: "org-1",
    provider: "generic_webhook",
    status: "CONNECTED",
    scopes: [],
    signingSecret: "test-secret",
    lastEventAt: null,
    ...overrides,
  };
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("handleWebhook", () => {
  it("rejects a request with no signature header", async () => {
    await expect(adapter.handleWebhook(connection(), {}, "{}")).rejects.toThrow("Missing X-Cedar-Signature");
  });

  it("rejects a request signed with the wrong secret", async () => {
    const body = JSON.stringify({ type: "lead.created" });
    const badSignature = sign("wrong-secret", body);
    await expect(
      adapter.handleWebhook(connection(), { "x-cedar-signature": badSignature }, body),
    ).rejects.toThrow("Invalid webhook signature");
  });

  it("rejects a body that isn't valid JSON, even with a correct signature", async () => {
    const body = "not json";
    const signature = sign("test-secret", body);
    await expect(
      adapter.handleWebhook(connection(), { "x-cedar-signature": signature }, body),
    ).rejects.toThrow("not valid JSON");
  });

  it("accepts a correctly signed request and uses the payload's own id as the idempotency key", async () => {
    const body = JSON.stringify({ id: "evt_123", type: "lead.created", email: "a@b.com" });
    const signature = sign("test-secret", body);
    const events = await adapter.handleWebhook(connection(), { "x-cedar-signature": signature }, body);
    expect(events).toEqual([{ idempotencyKey: "evt_123", eventType: "lead.created", payload: { id: "evt_123", type: "lead.created", email: "a@b.com" } }]);
  });

  it("derives an idempotency key from the body when the payload has no id", async () => {
    const body = JSON.stringify({ type: "ping" });
    const signature = sign("test-secret", body);
    const events = await adapter.handleWebhook(connection(), { "x-cedar-signature": signature }, body);
    expect(events[0].idempotencyKey).toBe(sign("test-secret", body));

    // Replaying the exact same body produces the exact same key — this
    // is what lets the caller dedupe a retried webhook delivery.
    const eventsAgain = await adapter.handleWebhook(connection(), { "x-cedar-signature": signature }, body);
    expect(eventsAgain[0].idempotencyKey).toBe(events[0].idempotencyKey);
  });
});

describe("healthCheck", () => {
  it("reports connected with no events yet", async () => {
    const health = await adapter.healthCheck(connection());
    expect(health.status).toBe("CONNECTED");
    expect(health.detail).toContain("no events received yet");
  });

  it("reports degraded after 7+ days without an event", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const health = await adapter.healthCheck(connection({ lastEventAt: eightDaysAgo }));
    expect(health.status).toBe("DEGRADED");
  });

  it("reflects a non-connected status as-is", async () => {
    const health = await adapter.healthCheck(connection({ status: "DISCONNECTED" }));
    expect(health.status).toBe("DISCONNECTED");
  });
});

describe("methods that are not applicable to a push-only receiver", () => {
  it("sync returns no changes", async () => {
    const result = await adapter.sync(connection(), null);
    expect(result).toEqual({ changes: [], nextCursor: null });
  });

  it("execute reports it has no capability", async () => {
    const result = await adapter.execute(connection(), "anything", "key-1");
    expect(result.ok).toBe(false);
  });

  it("reconcile reports not applicable without drift", async () => {
    const result = await adapter.reconcile(connection(), "anything");
    expect(result.drifted).toBe(false);
  });
});
