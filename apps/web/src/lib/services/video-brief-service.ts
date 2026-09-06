import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

export interface VideoBriefInput {
  concept?: string;
  hook?: string;
  storyboardNotes?: string;
  script?: string;
  voiceoverCopy?: string;
  captionCopy?: string;
  editInstructions?: string;
  musicNotes?: string;
  platformVariants?: string[];
}

/**
 * Video pre-production planning is versioned the same way Brand DNA is
 * (Section 5 / Section 11.1: "version scripts and edits") — a save always
 * inserts a new VideoBriefVersion rather than mutating the latest one.
 * The eventual final video file goes through the Creative's own
 * versioning + approval pipeline (Section 15.1), which this does not
 * duplicate.
 */
export async function saveVideoBrief(params: {
  actorUserId: string;
  organizationId: string;
  creativeId: string;
  input: VideoBriefInput;
}) {
  const creative = await prisma.creative.findFirst({
    where: { id: params.creativeId, campaign: { project: { client: { organizationId: params.organizationId } } } },
    include: { campaign: { include: { project: true } } },
  });
  if (!creative) throw new AuthError("Creative not found.");
  const clientId = creative.campaign.project.clientId;

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId,
  });

  const result = await prisma.$transaction(async (tx) => {
    let brief = await tx.videoBrief.findUnique({ where: { creativeId: creative.id } });
    if (!brief) {
      brief = await tx.videoBrief.create({ data: { creativeId: creative.id, currentVersion: 0 } });
    }

    const nextVersion = brief.currentVersion + 1;

    const version = await tx.videoBriefVersion.create({
      data: {
        videoBriefId: brief.id,
        version: nextVersion,
        concept: params.input.concept || null,
        hook: params.input.hook || null,
        storyboardNotes: params.input.storyboardNotes || null,
        script: params.input.script || null,
        voiceoverCopy: params.input.voiceoverCopy || null,
        captionCopy: params.input.captionCopy || null,
        editInstructions: params.input.editInstructions || null,
        musicNotes: params.input.musicNotes || null,
        platformVariants: JSON.stringify(params.input.platformVariants ?? []),
        createdBy: membership.id,
      },
    });

    await tx.videoBrief.update({ where: { id: brief.id }, data: { currentVersion: nextVersion } });

    return version;
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "video_brief.version_created",
    resourceType: "VideoBriefVersion",
    resourceId: result.id,
    clientId,
    result: "SUCCESS",
    changeSet: { version: result.version },
  });

  return result;
}
