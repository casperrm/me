import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

export interface BrandVersionInput {
  colors: { name: string; hex: string }[];
  fonts: { role: string; family: string }[];
  toneOfVoice: string;
  visualStyle: string;
  targetAudience: string;
  products: string[];
  approvedPatterns: { pattern: string; rationale: string }[];
  rejectedPatterns: { pattern: string; rationale: string }[];
}

/**
 * Brand DNA is versioned (Bible Section 5: "so historical creative can be
 * evaluated against the rules active at creation time") — this always
 * inserts a new BrandProfileVersion rather than mutating the latest one
 * in place, and bumps BrandProfile.currentVersion to point at it.
 */
export async function createBrandVersion(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  input: BrandVersionInput;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: params.clientId,
  });

  const client = await prisma.client.findFirst({
    where: { id: params.clientId, organizationId: params.organizationId },
  });
  if (!client) throw new AuthError("Client not found.");

  const result = await prisma.$transaction(async (tx) => {
    let brandProfile = await tx.brandProfile.findUnique({ where: { clientId: client.id } });
    if (!brandProfile) {
      brandProfile = await tx.brandProfile.create({ data: { clientId: client.id, currentVersion: 0 } });
    }

    const nextVersion = brandProfile.currentVersion + 1;

    const version = await tx.brandProfileVersion.create({
      data: {
        brandProfileId: brandProfile.id,
        version: nextVersion,
        colors: JSON.stringify(params.input.colors),
        fonts: JSON.stringify(params.input.fonts),
        toneOfVoice: params.input.toneOfVoice || null,
        visualStyle: params.input.visualStyle || null,
        targetAudience: params.input.targetAudience || null,
        products: JSON.stringify(params.input.products),
        approvedPatterns: JSON.stringify(params.input.approvedPatterns),
        rejectedPatterns: JSON.stringify(params.input.rejectedPatterns),
        createdBy: membership.id,
      },
    });

    await tx.brandProfile.update({ where: { id: brandProfile.id }, data: { currentVersion: nextVersion } });

    return version;
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "brand_profile.version_created",
    resourceType: "BrandProfileVersion",
    resourceId: result.id,
    clientId: client.id,
    result: "SUCCESS",
    changeSet: { version: result.version },
  });

  await prisma.clientTimelineEvent.create({
    data: {
      clientId: client.id,
      type: "brand_dna_updated",
      summary: `Brand DNA updated to version ${result.version}.`,
    },
  });

  return result;
}
