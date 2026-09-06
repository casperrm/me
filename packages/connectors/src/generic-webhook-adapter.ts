import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AuthorizeContext,
  ConnectionHealth,
  ConnectionRecord,
  ConnectorAdapter,
  DriftReport,
  ExternalResult,
  SyncResult,
  VerifiedEvent,
} from "./contract";

export interface GenericWebhookConnection extends ConnectionRecord {
  /** Plaintext, decrypted by the caller immediately before use — this class never persists it. */
  signingSecret: string;
  lastEventAt: Date | null;
}

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The one real, fully-working connector this slice implements — a
 * provider-agnostic inbound webhook receiver. No OAuth app registration
 * or third-party account is needed: an organization generates a signing
 * secret here and configures it on whatever external tool will call in
 * (Zapier, Make, a custom script, another internal system). This proves
 * the Section 34 contract end-to-end without needing credentials this
 * environment can't obtain for Meta/TikTok/Google/WhatsApp (see
 * docs/specs/integration-center.md for that scope boundary).
 *
 * Several contract methods are genuinely not applicable to a push-only
 * receiver (refresh, sync, execute, reconcile) — documented per-method
 * below rather than silently stubbed.
 */
export class GenericWebhookAdapter implements ConnectorAdapter<GenericWebhookConnection> {
  async authorize(context: AuthorizeContext): Promise<GenericWebhookConnection> {
    // The caller (connection-service.ts) generates the real signing
    // secret and persists the DB row; this just describes the shape a
    // fresh connection starts in. There's no OAuth redirect to perform —
    // "authorizing" this connector IS registering its signing secret
    // with the external tool that will call in.
    return {
      id: "",
      organizationId: context.organizationId,
      provider: "generic_webhook",
      status: "CONNECTED",
      scopes: [],
      signingSecret: "",
      lastEventAt: null,
    };
  }

  async refresh(connection: GenericWebhookConnection): Promise<GenericWebhookConnection> {
    // Not applicable: the signing secret is caller-generated and doesn't
    // expire — there is no OAuth token to refresh.
    return connection;
  }

  async healthCheck(connection: GenericWebhookConnection): Promise<ConnectionHealth> {
    if (connection.status !== "CONNECTED") {
      return { status: connection.status, detail: "Connection is not active.", lastCheckedAt: new Date() };
    }
    if (!connection.lastEventAt) {
      return { status: "CONNECTED", detail: "Connected — no events received yet.", lastCheckedAt: new Date() };
    }
    const staleSinceMs = Date.now() - connection.lastEventAt.getTime();
    if (staleSinceMs > STALE_AFTER_MS) {
      const days = Math.floor(staleSinceMs / (24 * 60 * 60 * 1000));
      return { status: "DEGRADED", detail: `No event received in ${days} day(s).`, lastCheckedAt: new Date() };
    }
    return { status: "CONNECTED", detail: `Last event received ${connection.lastEventAt.toISOString()}.`, lastCheckedAt: new Date() };
  }

  async sync(_connection: GenericWebhookConnection, _cursor: string | null): Promise<SyncResult> {
    // Not applicable: this connector is push-only by nature — the
    // external side calls us, there is nothing to pull on a cursor.
    return { changes: [], nextCursor: null };
  }

  async handleWebhook(
    connection: GenericWebhookConnection,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<VerifiedEvent[]> {
    const signature = headers["x-cedar-signature"];
    if (!signature) throw new Error("Missing X-Cedar-Signature header.");

    const expected = createHmac("sha256", connection.signingSecret).update(rawBody).digest("hex");
    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
      throw new Error("Invalid webhook signature.");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new Error("Webhook payload is not valid JSON.");
    }

    // Idempotency key (Section 17.1: "deduplicate webhook events"): the
    // sender's own event id when it provides one, otherwise a hash of
    // the raw body — either way, replaying the exact same request
    // produces the same key so the caller can dedupe it.
    const idempotencyKey =
      typeof parsed.id === "string" && parsed.id.length > 0
        ? parsed.id
        : createHmac("sha256", connection.signingSecret).update(rawBody).digest("hex");

    return [{ idempotencyKey, eventType: typeof parsed.type === "string" ? parsed.type : null, payload: parsed }];
  }

  async execute(_connection: GenericWebhookConnection, _command: string, _idempotencyKey: string): Promise<ExternalResult> {
    // Not applicable: a webhook receiver has no outbound command channel
    // to the external side — it only ever receives, never calls out.
    return { ok: false, error: "generic_webhook is receive-only; it has no execute() capability." };
  }

  async reconcile(_connection: GenericWebhookConnection, _scope: string): Promise<DriftReport> {
    // Not applicable for the same reason as sync(): there is no external
    // system of record this side could compare itself against.
    return {
      scope: "generic_webhook",
      drifted: false,
      detail: "Not applicable — a webhook receiver has no external state to reconcile against.",
    };
  }

  async revoke(connection: GenericWebhookConnection): Promise<{ ok: boolean }> {
    return { ok: connection.status !== "DISCONNECTED" };
  }
}
