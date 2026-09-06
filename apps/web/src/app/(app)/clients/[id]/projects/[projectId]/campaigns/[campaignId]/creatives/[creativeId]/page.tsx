import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { AddVersionForm } from "./AddVersionForm";
import { CreativeActions } from "./CreativeActions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  APPROVED: "bg-cedar-100 text-cedar-800",
  REJECTED: "bg-red-100 text-red-700",
};

const DECISION_STYLE: Record<string, string> = {
  requested: "text-amber-700",
  changes_requested: "text-red-600",
  approved: "text-cedar-700",
  canceled: "text-neutral-500",
};

export default async function CreativeDetailPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string; campaignId: string; creativeId: string }>;
}) {
  const { id, projectId, campaignId, creativeId } = await params;
  const actor = await requireActor();

  const creative = await prisma.creative.findFirst({
    where: {
      id: creativeId,
      campaignId,
      campaign: { projectId, project: { clientId: id, client: { organizationId: actor.organizationId } } },
    },
    include: {
      campaign: { include: { project: { include: { client: true } } } },
      versions: {
        orderBy: { version: "desc" },
        include: { approvals: { orderBy: { createdAt: "asc" } }, asset: true },
      },
    },
  });
  if (!creative) notFound();

  const clientId = creative.campaign.project.clientId;

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this creative." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId,
  });

  const assets = canWrite
    ? await prisma.asset.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true, filename: true } })
    : [];

  const currentVersion = creative.versions.find((v) => v.version === creative.currentVersion);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/clients/${id}/projects/${projectId}/campaigns/${campaignId}`}
          className="text-xs text-cedar-700 hover:underline"
        >
          ← {creative.campaign.name}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {creative.type} {creative.platform && <span className="text-neutral-400">— {creative.platform}</span>}
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[creative.status] ?? ""}`}>{creative.status}</span>
        </div>
      </div>

      {canWrite && currentVersion && (
        <Card title={`Actions — version ${currentVersion.version}`}>
          <CreativeActions creativeVersionId={currentVersion.id} status={creative.status} />
        </Card>
      )}

      <Card title="Version history">
        <ul className="space-y-4">
          {creative.versions.map((version) => (
            <li key={version.id} className="border-b border-neutral-50 pb-4 last:border-0">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  v{version.version} {version.version === creative.currentVersion && <span className="text-xs text-cedar-700">(current)</span>}
                </span>
                <span className="text-xs text-neutral-400">{version.createdAt.toLocaleDateString()}</span>
              </div>
              {version.notes && <p className="mt-1 text-sm text-neutral-600">{version.notes}</p>}
              {version.asset && (
                <p className="mt-1 text-xs text-neutral-400">Asset: {version.asset.filename}</p>
              )}
              {version.approvals.length > 0 && (
                <ul className="mt-2 space-y-1 border-l border-neutral-100 pl-3">
                  {version.approvals.map((approval) => (
                    <li key={approval.id} className="text-xs">
                      <span className={DECISION_STYLE[approval.decision] ?? "text-neutral-500"}>{approval.decision}</span>
                      {approval.decidedBy && <span className="text-neutral-400"> by {approval.decidedBy}</span>}
                      {approval.comment && <span className="text-neutral-500"> — {approval.comment}</span>}
                      <span className="text-neutral-300"> · {approval.createdAt.toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {canWrite && (
        <Card title="Add new version">
          <AddVersionForm creativeId={creative.id} assets={assets} />
        </Card>
      )}
    </div>
  );
}
