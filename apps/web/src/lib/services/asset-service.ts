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

// Bounds every asset-picker dropdown to a real search instead of loading
// a client's entire file history into a <select> — Phase 7 scale
// hardening's last remaining audit item (see
// docs/specs/asset-picker-search.md). A blank query returns the most
// recent files (a real, useful default), not an error.
const ASSET_SEARCH_RESULTS_LIMIT = 10;

export async function searchClientAssets(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  query: string;
}) {
  await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:read",
    clientId: params.clientId,
  });

  const q = params.query.trim();
  return prisma.asset.findMany({
    where: {
      clientId: params.clientId,
      status: "AVAILABLE",
      ...(q ? { filename: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: ASSET_SEARCH_RESULTS_LIMIT,
    select: { id: true, filename: true },
  });
}

function assetTypeFromContentType(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "document";
  return "document";
}

function validateUpload(contentType: string, data: Buffer) {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new AssetValidationError(`File type "${contentType}" is not allowed.`);
  }
  if (data.byteLength === 0) {
    throw new AssetValidationError("File is empty.");
  }
  if (data.byteLength > MAX_SIZE_BYTES) {
    throw new AssetValidationError(`File exceeds the ${MAX_SIZE_BYTES / (1024 * 1024)}MB limit.`);
  }
}

export async function uploadAsset(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}) {
  validateUpload(params.contentType, params.data);

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

/**
 * Section 12's "task... attachments" — reuses the same Asset model and
 * storage adapter as client files (Section 14) rather than a parallel
 * upload path, since a task attachment is just a file scoped one level
 * deeper (organization -> client -> project -> task) than a client file.
 * See docs/specs/projects-and-calendar.md for the scope boundary.
 */
export async function uploadTaskAttachment(params: {
  actorUserId: string;
  organizationId: string;
  taskId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}) {
  validateUpload(params.contentType, params.data);

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    include: { project: { include: { client: true } } },
  });
  if (!task || task.project.client.organizationId !== params.organizationId) {
    throw new AuthError("Task not found.");
  }

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: task.project.clientId,
  });

  const storageKey = `${params.organizationId}/${task.project.clientId}/tasks/${task.id}/${randomUUID()}-${params.filename}`;
  const stored = await storageAdapter.put({ key: storageKey, data: params.data, contentType: params.contentType });

  const asset = await prisma.asset.create({
    data: {
      organizationId: params.organizationId,
      clientId: task.project.clientId,
      projectId: task.projectId,
      taskId: task.id,
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
    action: "task_attachment.uploaded",
    resourceType: "Asset",
    resourceId: asset.id,
    clientId: task.project.clientId,
    result: "SUCCESS",
    changeSet: { filename: asset.filename, sizeBytes: asset.sizeBytes, taskId: task.id },
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

  // Section 14: "Prevent orphaned assets through reference tracking."
  // creative_versions.assetId is ON DELETE SET NULL (migration
  // 20260906180500), so without this check the delete would succeed but
  // silently null out a creative version's deliverable with no warning
  // and no audit trail explaining why it disappeared.
  const referencingVersion = await prisma.creativeVersion.findFirst({ where: { assetId: asset.id } });
  if (referencingVersion) {
    throw new AssetValidationError("This file is attached to a creative version and can't be deleted while it's in use.");
  }

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
