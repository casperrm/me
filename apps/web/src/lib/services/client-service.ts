import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

const LIFECYCLE_STAGES = ["PROSPECT", "ACTIVE", "PAUSED", "CHURNED"] as const;

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
