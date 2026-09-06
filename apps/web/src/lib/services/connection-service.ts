import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { GenericWebhookAdapter, type GenericWebhookConnection, type ConnectionRecord } from "@cedar/connectors";
import { AuthError } from "./auth-service";

const adapter = new GenericWebhookAdapter();

function toConnectionRecord(c: { id: string; organizationId: string; provider: string; status: string; scopes: string }): ConnectionRecord {
  return {
    id: c.id,
    organizationId: c.organizationId,
    provider: c.provider,
    status: c.status as ConnectionRecord["status"],
    scopes: JSON.parse(c.scopes),
  };
}

export interface ConnectionSummary {
  id: string;
  provider: string;
  name: string;
  status: string;
  healthDetail: string;
  lastEventAt: Date | null;
  eventCount: number;
}

/**
 * Section 17.1's Connector Framework, with the one real provider this
 * slice implements ("generic_webhook" — packages/connectors'
 * GenericWebhookAdapter). Gated on `organization:manage`, same as other
 * org-wide infrastructure config — a connection's signing secret is
 * sensitive, comparable in blast radius to inviting a member.
 */
export async function createGenericWebhookConnection(params: {
  actorUserId: string;
  organizationId: string;
  name: string;
}): Promise<{ connectionId: string; signingSecret: string }> {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "organization:manage",
  });

  if (!params.name.trim()) throw new AuthError("Connection name is required.");

  // Generated here, encrypted at rest, and returned to the caller exactly
  // once — the same one-time-reveal discipline as an API key. There is no
  // "show secret again" path; re-rolling means revoking and creating a
  // new connection.
  const signingSecret = randomBytes(32).toString("hex");

  const connection = await prisma.connection.create({
    data: {
      organizationId: params.organizationId,
      provider: "generic_webhook",
      name: params.name.trim(),
      status: "CONNECTED",
      scopes: "[]",
      signingSecretEncrypted: encryptSecret(signingSecret),
      createdByMembershipId: membership.id,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "connection.created",
    resourceType: "Connection",
    resourceId: connection.id,
    result: "SUCCESS",
    changeSet: { provider: connection.provider, name: connection.name },
  });

  return { connectionId: connection.id, signingSecret };
}

export async function listConnections(organizationId: string): Promise<ConnectionSummary[]> {
  const connections = await prisma.connection.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });

  return Promise.all(
    connections.map(async (c) => {
      const health = await adapter.healthCheck({
        ...toConnectionRecord(c),
        signingSecret: "", // healthCheck never touches the secret
        lastEventAt: c.lastEventAt,
      });
      return {
        id: c.id,
        provider: c.provider,
        name: c.name,
        status: health.status,
        healthDetail: health.detail,
        lastEventAt: c.lastEventAt,
        eventCount: c.eventCount,
      };
    }),
  );
}

export async function revokeConnection(params: { actorUserId: string; organizationId: string; connectionId: string }) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "organization:manage",
  });

  const connection = await prisma.connection.findFirst({
    where: { id: params.connectionId, organizationId: params.organizationId },
  });
  if (!connection) throw new AuthError("Connection not found.");

  const updated = await prisma.connection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED" } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "connection.revoked",
    resourceType: "Connection",
    resourceId: connection.id,
    result: "SUCCESS",
    changeSet: { before: { status: connection.status }, after: { status: "DISCONNECTED" } },
  });

  return updated;
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}

/**
 * The public webhook endpoint's real work: verify the HMAC signature via
 * the adapter, then persist the event with the idempotency key as a
 * unique-constraint dedupe (Section 17.1: "deduplicate webhook events") —
 * a retried delivery of the exact same event silently no-ops rather than
 * erroring or double-counting.
 */
export async function receiveWebhookEvent(params: {
  connectionId: string;
  headers: Record<string, string>;
  rawBody: string;
}): Promise<{ idempotencyKey: string; deduped: boolean }[]> {
  const connection = await prisma.connection.findUnique({ where: { id: params.connectionId } });
  if (!connection) throw new AuthError("Connection not found.");
  if (connection.status === "DISCONNECTED") throw new AuthError("This connection has been revoked.");

  const signingSecret = decryptSecret(connection.signingSecretEncrypted);
  const webhookConnection: GenericWebhookConnection = {
    ...toConnectionRecord(connection),
    signingSecret,
    lastEventAt: connection.lastEventAt,
  };

  const events = await adapter.handleWebhook(webhookConnection, params.headers, params.rawBody);

  const results: { idempotencyKey: string; deduped: boolean }[] = [];
  for (const event of events) {
    try {
      await prisma.connectionEvent.create({
        data: {
          connectionId: connection.id,
          idempotencyKey: event.idempotencyKey,
          eventType: event.eventType,
          payload: JSON.stringify(event.payload),
        },
      });
      await prisma.connection.update({
        where: { id: connection.id },
        data: { lastEventAt: new Date(), eventCount: { increment: 1 } },
      });
      results.push({ idempotencyKey: event.idempotencyKey, deduped: false });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        results.push({ idempotencyKey: event.idempotencyKey, deduped: true });
        continue;
      }
      throw err;
    }
  }
  return results;
}
