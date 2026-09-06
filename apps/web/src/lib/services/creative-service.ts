import { requireAnyPermission, requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

async function assertProjectInOrg(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, client: { organizationId } },
    include: { client: true },
  });
  if (!project) throw new AuthError("Project not found.");
  return project;
}

async function assertCampaignInOrg(campaignId: string, organizationId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, project: { client: { organizationId } } },
    include: { project: { include: { client: true } } },
  });
  if (!campaign) throw new AuthError("Campaign not found.");
  return campaign;
}

async function assertCreativeInOrg(creativeId: string, organizationId: string) {
  const creative = await prisma.creative.findFirst({
    where: { id: creativeId, campaign: { project: { client: { organizationId } } } },
    include: { campaign: { include: { project: { include: { client: true } } } } },
  });
  if (!creative) throw new AuthError("Creative not found.");
  return creative;
}

async function assertCreativeVersionInOrg(creativeVersionId: string, organizationId: string) {
  const version = await prisma.creativeVersion.findFirst({
    where: { id: creativeVersionId, creative: { campaign: { project: { client: { organizationId } } } } },
    include: { creative: { include: { campaign: { include: { project: { include: { client: true } } } } } } },
  });
  if (!version) throw new AuthError("Creative version not found.");
  return version;
}

export async function createCampaign(params: {
  actorUserId: string;
  organizationId: string;
  projectId: string;
  name: string;
  objective?: string;
  platform?: string;
  budgetCents?: number;
}) {
  const project = await assertProjectInOrg(params.projectId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: project.clientId,
  });

  if (!params.name.trim()) throw new AuthError("Campaign name is required.");

  const campaign = await prisma.campaign.create({
    data: {
      projectId: project.id,
      name: params.name.trim(),
      objective: params.objective || undefined,
      platform: params.platform || undefined,
      budgetCents: params.budgetCents,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "campaign.created",
    resourceType: "Campaign",
    resourceId: campaign.id,
    clientId: project.clientId,
    result: "SUCCESS",
    changeSet: { name: campaign.name },
  });

  await prisma.clientTimelineEvent.create({
    data: { clientId: project.clientId, type: "campaign_created", summary: `Campaign "${campaign.name}" created.` },
  });

  return campaign;
}

export async function createCreative(params: {
  actorUserId: string;
  organizationId: string;
  campaignId: string;
  type: string;
  platform?: string;
  notes?: string;
}) {
  const campaign = await assertCampaignInOrg(params.campaignId, params.organizationId);
  const clientId = campaign.project.clientId;
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId,
  });

  if (!params.type.trim()) throw new AuthError("Creative type is required.");

  const creative = await prisma.$transaction(async (tx) => {
    const creative = await tx.creative.create({
      data: { campaignId: campaign.id, type: params.type.trim(), platform: params.platform || undefined, currentVersion: 1 },
    });
    await tx.creativeVersion.create({
      data: { creativeId: creative.id, version: 1, notes: params.notes || undefined },
    });
    return creative;
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "creative.created",
    resourceType: "Creative",
    resourceId: creative.id,
    clientId,
    result: "SUCCESS",
    changeSet: { type: creative.type },
  });

  return creative;
}

export async function addCreativeVersion(params: {
  actorUserId: string;
  organizationId: string;
  creativeId: string;
  notes?: string;
  assetId?: string;
}) {
  const creative = await assertCreativeInOrg(params.creativeId, params.organizationId);
  const clientId = creative.campaign.project.clientId;
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId,
  });

  if (params.assetId) {
    const asset = await prisma.asset.findFirst({ where: { id: params.assetId, organizationId: params.organizationId } });
    if (!asset) throw new AuthError("Asset not found.");
  }

  const nextVersion = creative.currentVersion + 1;

  const version = await prisma.$transaction(async (tx) => {
    const version = await tx.creativeVersion.create({
      data: { creativeId: creative.id, version: nextVersion, notes: params.notes || undefined, assetId: params.assetId },
    });
    // A new version invalidates whatever approval state the previous
    // version was in (Section 15.1: an outstanding request against a
    // superseded version is no longer meaningful) — back to DRAFT until
    // this version is explicitly submitted for approval again.
    await tx.creative.update({ where: { id: creative.id }, data: { currentVersion: nextVersion, status: "DRAFT" } });
    return version;
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "creative.version_added",
    resourceType: "CreativeVersion",
    resourceId: version.id,
    clientId,
    result: "SUCCESS",
    changeSet: { version: nextVersion },
  });

  return version;
}

export async function requestApproval(params: {
  actorUserId: string;
  organizationId: string;
  creativeVersionId: string;
  comment?: string;
}) {
  const version = await assertCreativeVersionInOrg(params.creativeVersionId, params.organizationId);
  const clientId = version.creative.campaign.project.clientId;
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId,
  });

  if (version.version !== version.creative.currentVersion) {
    throw new AuthError("Only the current version can be submitted for approval.");
  }

  const approval = await prisma.$transaction(async (tx) => {
    const approval = await tx.approval.create({
      data: { creativeVersionId: version.id, decision: "requested", comment: params.comment || undefined },
    });
    await tx.creative.update({ where: { id: version.creativeId }, data: { status: "PENDING_APPROVAL" } });
    return approval;
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "approval.requested",
    resourceType: "CreativeVersion",
    resourceId: version.id,
    clientId,
    result: "SUCCESS",
  });

  return approval;
}

const DECISIONS = ["approved", "changes_requested", "canceled"] as const;
export type ApprovalDecision = (typeof DECISIONS)[number];

const STATUS_FOR_DECISION: Record<ApprovalDecision, string> = {
  approved: "APPROVED",
  changes_requested: "DRAFT",
  canceled: "DRAFT",
};

export async function recordApprovalDecision(params: {
  actorUserId: string;
  actorName: string;
  organizationId: string;
  creativeVersionId: string;
  decision: ApprovalDecision;
  comment?: string;
  decidedBy?: string;
}) {
  if (!DECISIONS.includes(params.decision)) throw new AuthError("Invalid decision.");

  const version = await assertCreativeVersionInOrg(params.creativeVersionId, params.organizationId);
  const clientId = version.creative.campaign.project.clientId;
  // Either an internal team member reviewing their own team's work
  // (clients:write) or a Client Portal contact recording their own
  // decision (approvals:decide, Section 15.2) — see the doc comment on
  // requireAnyPermission for why this is an OR, not a new broader
  // permission.
  const membership = await requireAnyPermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permissions: ["clients:write", "approvals:decide"],
    clientId,
  });

  if (version.creative.status !== "PENDING_APPROVAL") {
    throw new AuthError("This version has no pending approval request.");
  }

  // A Client Portal contact's decision is always attributed to their own
  // authenticated name, never to whatever `decidedBy` text was submitted
  // — otherwise a portal contact could record a decision under someone
  // else's name. Free-text `decidedBy` is only trusted from internal
  // staff, who use it to record a decision made by a client contact who
  // isn't logged in themselves.
  const decidedBy = membership.role === "CLIENT_PORTAL" ? params.actorName : params.decidedBy || undefined;

  const approval = await prisma.$transaction(async (tx) => {
    const approval = await tx.approval.create({
      data: {
        creativeVersionId: version.id,
        decision: params.decision,
        comment: params.comment || undefined,
        decidedBy,
      },
    });
    await tx.creative.update({ where: { id: version.creativeId }, data: { status: STATUS_FOR_DECISION[params.decision] } });
    return approval;
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "approval.decided",
    resourceType: "CreativeVersion",
    resourceId: version.id,
    clientId,
    result: "SUCCESS",
    changeSet: { decision: params.decision, decidedBy },
  });

  if (params.decision === "approved") {
    await prisma.clientTimelineEvent.create({
      data: { clientId, type: "creative_approved", summary: `A creative was approved (v${version.version}).` },
    });
  }

  return approval;
}
