import { randomUUID } from "node:crypto";
import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { storageAdapter } from "../storage";
import { AuthError } from "./auth-service";

// Upload validation (Bible Section 14: "Virus/malware scanning and
// file-type validation for uploads"). File-type/size validation is real;
// virus/malware scanning is not — there's no AV service available in
// this environment. Every asset is created with status AVAILABLE
// directly rather than a PENDING_SCAN step that nothing ever resolves,
// since a status that never transitions is worse than being honest that
// scanning doesn't happen yet. Wire a real scanner (e.g. an
// apps/worker job calling ClamAV or a cloud AV API) before this handles
// untrusted third-party uploads (Client Portal, Phase 2) rather than
// only internal team uploads.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
]);
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export class AssetValidationError extends AuthError {}

function assetTypeFromContentType(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "document";
  return "document";
}

export async function uploadAsset(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}) {
  if (!ALLOWED_CONTENT_TYPES.has(params.contentType)) {
    throw new AssetValidationError(`File type "${params.contentType}" is not allowed.`);
  }
  if (params.data.byteLength === 0) {
    throw new AssetValidationError("File is empty.");
  }
  if (params.data.byteLength > MAX_SIZE_BYTES) {
    throw new AssetValidationError(`File exceeds the ${MAX_SIZE_BYTES / (1024 * 1024)}MB limit.`);
  }

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: params.clientId,
  });

  const client = await prisma.client.findFirst({ where: { id: params.clientId, organizationId: params.organizationId } });
  if (!client) throw new AuthError("Client not found.");

  const storageKey = `${params.organizationId}/${params.clientId}/${randomUUID()}-${params.filename}`;
  const stored = await storageAdapter.put({ key: storageKey, data: params.data, contentType: params.contentType });

  const asset = await prisma.asset.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      type: assetTypeFromContentType(params.contentType),
      filename: params.filename,
      contentType: params.contentType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      storageKey: stored.key,
      status: "AVAILABLE",
      uploadedById: membership.id,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "asset.uploaded",
    resourceType: "Asset",
    resourceId: asset.id,
    clientId: params.clientId,
    result: "SUCCESS",
    changeSet: { filename: asset.filename, sizeBytes: asset.sizeBytes },
  });

  await prisma.clientTimelineEvent.create({
    data: { clientId: params.clientId, type: "asset_uploaded", summary: `File "${asset.filename}" uploaded.` },
  });

  return asset;
}

export async function deleteAsset(params: { actorUserId: string; organizationId: string; assetId: string }) {
  const asset = await prisma.asset.findFirst({ where: { id: params.assetId, organizationId: params.organizationId } });
  if (!asset) throw new AuthError("Asset not found.");

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: asset.clientId ?? undefined,
  });

  await storageAdapter.delete(asset.storageKey);
  await prisma.asset.delete({ where: { id: asset.id } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "asset.deleted",
    resourceType: "Asset",
    resourceId: asset.id,
    clientId: asset.clientId,
    result: "SUCCESS",
    changeSet: { filename: asset.filename },
  });
}
