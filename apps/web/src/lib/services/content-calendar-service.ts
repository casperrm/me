import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

export const CONTENT_STATUSES = [
  "BRIEF",
  "DRAFT",
  "INTERNAL_REVIEW",
  "CLIENT_APPROVAL",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

// Section 9's workflow: brief -> draft -> internal review -> client
// approval when required -> scheduled/ready -> publish -> performance ->
// learning. "Publish" here only marks the plan as published — no real
// connector call exists yet (Phase 4), so PUBLISHED just means "the plan
// says this went out." Changes can be requested back to DRAFT from either
// review stage; a scheduled item can fail (preserving a reason) and be
// rescheduled without starting the whole plan over.
const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  BRIEF: ["DRAFT"],
  DRAFT: ["INTERNAL_REVIEW"],
  INTERNAL_REVIEW: ["CLIENT_APPROVAL", "SCHEDULED", "DRAFT"],
  CLIENT_APPROVAL: ["SCHEDULED", "DRAFT"],
  SCHEDULED: ["PUBLISHED", "FAILED", "DRAFT"],
  PUBLISHED: [],
  FAILED: ["SCHEDULED", "DRAFT"],
};

export async function createContentCalendarItem(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  title: string;
  channel: string;
  campaignId?: string;
  creativeId?: string;
  contentPillar?: string;
  format?: string;
  ownerId?: string;
  dueDate?: Date;
  publishAt?: Date;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: params.clientId,
  });
  await assertClientInOrg(params.clientId, params.organizationId);

  if (!params.title.trim()) throw new AuthError("Title is required.");
  if (!params.channel.trim()) throw new AuthError("Channel is required.");

  if (params.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: params.campaignId, project: { clientId: params.clientId } },
    });
    if (!campaign) throw new AuthError("Campaign not found for this client.");
  }

  if (params.creativeId) {
    const creative = await prisma.creative.findFirst({
      where: { id: params.creativeId, campaign: { project: { clientId: params.clientId } } },
    });
    if (!creative) throw new AuthError("Creative not found for this client.");
  }

  if (params.ownerId) {
    const owner = await prisma.membership.findFirst({ where: { id: params.ownerId, organizationId: params.organizationId } });
    if (!owner) throw new AuthError("Owner is not a member of this organization.");
  }

  const item = await prisma.contentCalendarItem.create({
    data: {
      clientId: params.clientId,
      title: params.title.trim(),
      channel: params.channel.trim(),
      campaignId: params.campaignId,
      creativeId: params.creativeId,
      contentPillar: params.contentPillar || undefined,
      format: params.format || undefined,
      ownerId: params.ownerId,
      dueDate: params.dueDate,
      publishAt: params.publishAt,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "content_calendar_item.created",
    resourceType: "ContentCalendarItem",
    resourceId: item.id,
    clientId: params.clientId,
    result: "SUCCESS",
    changeSet: { title: item.title, channel: item.channel },
  });

  return item;
}

export async function setContentCalendarItemStatus(params: {
  actorUserId: string;
  organizationId: string;
  itemId: string;
  status: ContentStatus;
  failureReason?: string;
}) {
  if (!CONTENT_STATUSES.includes(params.status)) throw new AuthError("Invalid status.");

  const item = await prisma.contentCalendarItem.findUnique({
    where: { id: params.itemId },
    include: { client: true },
  });
  if (!item || item.client.organizationId !== params.organizationId) {
    throw new AuthError("Content calendar item not found.");
  }

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: item.clientId,
  });

  const currentStatus = item.status as ContentStatus;
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(params.status)) {
    throw new AuthError(`Cannot move from ${currentStatus} to ${params.status}.`);
  }
  if (params.status === "FAILED" && !params.failureReason?.trim()) {
    throw new AuthError("A failure reason is required when marking an item failed.");
  }

  const updated = await prisma.contentCalendarItem.update({
    where: { id: item.id },
    data: {
      status: params.status,
      failureReason: params.status === "FAILED" ? params.failureReason!.trim() : null,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "content_calendar_item.status_changed",
    resourceType: "ContentCalendarItem",
    resourceId: item.id,
    clientId: item.clientId,
    result: "SUCCESS",
    changeSet: { before: { status: currentStatus }, after: { status: params.status } },
  });

  return updated;
}
