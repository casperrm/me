import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { NewCreativeForm } from "./NewCreativeForm";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  APPROVED: "bg-cedar-100 text-cedar-800",
  REJECTED: "bg-red-100 text-red-700",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string; campaignId: string }>;
}) {
  const { id, projectId, campaignId } = await params;
  const actor = await requireActor();

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      projectId,
      project: { clientId: id, client: { organizationId: actor.organizationId } },
    },
    include: { project: { include: { client: true } }, creatives: true },
  });
  if (!campaign) notFound();

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId: campaign.project.clientId,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this campaign." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: campaign.project.clientId,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${id}/projects/${projectId}`} className="text-xs text-cedar-700 hover:underline">
          ← {campaign.project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{campaign.name}</h1>
        <p className="text-sm text-neutral-500">
          {campaign.status} {campaign.objective && `· ${campaign.objective}`}
        </p>
      </div>

      <Card title="Creatives">
        {campaign.creatives.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-400">No creatives yet.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {campaign.creatives.map((creative) => (
              <li key={creative.id}>
                <Link
                  href={`/clients/${id}/projects/${projectId}/campaigns/${campaignId}/creatives/${creative.id}`}
                  className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2 text-sm hover:border-cedar-300"
                >
                  <span>
                    {creative.type} {creative.platform && <span className="text-neutral-400">— {creative.platform}</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[creative.status] ?? ""}`}>
                    v{creative.currentVersion} · {creative.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canWrite && <NewCreativeForm campaignId={campaign.id} />}
      </Card>
    </div>
  );
}
