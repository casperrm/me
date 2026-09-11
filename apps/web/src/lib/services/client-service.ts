import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

const LIFECYCLE_STAGES = ["PROSPECT", "ACTIVE", "PAUSED", "CHURNED"] as const;

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

/**
 * Section 4 (Client Management) — a brand-new Client doesn't yet belong
 * to any existing client, so like `createProjectTemplateFromProject`'s
 * sibling org-wide functions, this is gated on `clients:write` with
 * **no `clientId`**: `can()` (packages/domain/src/policy.ts) restricts
 * that to OWNER, ADMIN, or an explicit org-wide `ScopedGrant`.
 */
export async function createClient(params: {
  actorUserId: string;
  organizationId: string;
  name: string;
  companyName: string;
  industry?: string;
  lifecycleStage?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
  });

  const name = params.name.trim();
  const companyName = params.companyName.trim();
  if (!name || !companyName) throw new AuthError("Client name and company name are required.");

  const lifecycleStage = params.lifecycleStage ?? "ACTIVE";
  if (!LIFECYCLE_STAGES.includes(lifecycleStage as (typeof LIFECYCLE_STAGES)[number])) {
    throw new AuthError("Invalid lifecycle stage.");
  }

  const industry = params.industry?.trim() || undefined;
  const primaryContactName = params.primaryContactName?.trim() || undefined;
  const primaryContactEmail = params.primaryContactEmail?.trim() || undefined;

  const client = await prisma.client.create({
    data: {
      organizationId: params.organizationId,
      name,
      companyName,
      industry,
      lifecycleStage,
      services: "[]",
      primaryContactName,
      primaryContactEmail,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "client.created",
    resourceType: "Client",
    resourceId: client.id,
    clientId: client.id,
    result: "SUCCESS",
    changeSet: { name: client.name, companyName: client.companyName, lifecycleStage: client.lifecycleStage },
  });

  return client;
}

/**
 * The missing half of `createClient` — named as this session's own
 * explicit follow-up in docs/specs/client-creation.md ("no client-editing
 * UI"). Unlike creation, this is scoped to the specific client being
 * edited (not org-wide), the same tier `createProject`/`createShoot`/
 * `createNote` already use for a write on an *existing* client. Every
 * field is optional — only the ones actually passed are validated and
 * changed, and the audit event's changeSet records only what genuinely
 * changed (before/after), not the whole row.
 */
export async function updateClient(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  name?: string;
  companyName?: string;
  industry?: string;
  lifecycleStage?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
}) {
  const client = await assertClientInOrg(params.clientId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const data: {
    name?: string;
    companyName?: string;
    industry?: string | null;
    lifecycleStage?: string;
    primaryContactName?: string | null;
    primaryContactEmail?: string | null;
  } = {};

  if (params.name !== undefined) {
    const name = params.name.trim();
    if (!name) throw new AuthError("Client name is required.");
    data.name = name;
  }
  if (params.companyName !== undefined) {
    const companyName = params.companyName.trim();
    if (!companyName) throw new AuthError("Company name is required.");
    data.companyName = companyName;
  }
  if (params.industry !== undefined) data.industry = params.industry.trim() || null;
  if (params.lifecycleStage !== undefined) {
    if (!LIFECYCLE_STAGES.includes(params.lifecycleStage as (typeof LIFECYCLE_STAGES)[number])) {
      throw new AuthError("Invalid lifecycle stage.");
    }
    data.lifecycleStage = params.lifecycleStage;
  }
  if (params.primaryContactName !== undefined) data.primaryContactName = params.primaryContactName.trim() || null;
  if (params.primaryContactEmail !== undefined) data.primaryContactEmail = params.primaryContactEmail.trim() || null;

  if (Object.keys(data).length === 0) throw new AuthError("No changes provided.");

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    const previousValue = client[key];
    if (previousValue !== data[key]) {
      before[key] = previousValue;
      after[key] = data[key];
    }
  }

  const updated = await prisma.client.update({ where: { id: client.id }, data });

  if (Object.keys(after).length > 0) {
    await emitAuditEvent({
      organizationId: params.organizationId,
      actorType: "USER",
      actorId: membership.id,
      action: "client.updated",
      resourceType: "Client",
      resourceId: client.id,
      clientId: client.id,
      result: "SUCCESS",
      changeSet: { before, after },
    });
  }

  return updated;
}
