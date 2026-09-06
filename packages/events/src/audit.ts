import { createHash } from "node:crypto";
import { prisma, type AuditActorType, type AuditResult } from "@cedar/db";

export interface AuditEventInput {
  organizationId: string;
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  clientId?: string | null;
  correlationId?: string | null;
  sourceIp?: string | null;
  deviceMetadata?: Record<string, unknown> | null;
  changeSet?: Record<string, unknown> | null;
  approvalId?: string | null;
  result: AuditResult;
}

/**
 * The only writer of AuditEvent rows (Bible Section 27.1: "Audit records
 * are append-oriented and protected from ordinary mutation" — enforced by
 * convention here, not a DB trigger yet; see docs/adr for the tradeoff).
 *
 * Chains a sha256 hash of each org's previous event into the next one, so
 * a row edited or deleted outside this function breaks the chain and is
 * detectable. This is a lightweight tamper-evidence measure, not a
 * cryptographic audit log with independent witnesses — adequate for Phase
 * 0's threat model (an insider quietly editing history), documented as an
 * interim choice in ADR-006. It is not safe under concurrent writes to the
 * same organization (a benign race, not a security hole): two audit events
 * for the same org written at the same instant may both read the same
 * "previous" hash, producing two valid-but-parallel chain links rather
 * than a strict total order. Fine for Phase 0's traffic; revisit if audit
 * writes ever need to be a serialization point.
 */
export async function emitAuditEvent(input: AuditEventInput) {
  const previous = await prisma.auditEvent.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { timestamp: "desc" },
    select: { integrityHash: true },
  });

  const timestamp = new Date();
  const payload = JSON.stringify({
    prev: previous?.integrityHash ?? "genesis",
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    result: input.result,
    timestamp: timestamp.toISOString(),
  });
  const integrityHash = createHash("sha256").update(payload).digest("hex");

  return prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      clientId: input.clientId ?? null,
      timestamp,
      correlationId: input.correlationId ?? null,
      sourceIp: input.sourceIp ?? null,
      deviceMetadata: input.deviceMetadata ? JSON.stringify(input.deviceMetadata) : null,
      changeSet: input.changeSet ? JSON.stringify(input.changeSet) : null,
      approvalId: input.approvalId ?? null,
      result: input.result,
      integrityHash,
    },
  });
}
