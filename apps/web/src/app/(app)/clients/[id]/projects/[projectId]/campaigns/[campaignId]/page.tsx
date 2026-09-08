import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { getCampaignProfitability } from "@/lib/services/profitability-service";
import { NewCreativeForm } from "./NewCreativeForm";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  APPROVED: "bg-cedar-100 text-cedar-800",
  REJECTED: "bg-red-100 text-red-700",
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

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

  const canReadFinance = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "finance:read",
  });
  // Computed from all of the project's campaigns, then this one
  // campaign's row is picked out — same pattern the project detail page
  // uses to pick its own row out of getProjectProfitability(clientId).
  const campaignProfitability = canReadFinance
    ? (await getCampaignProfitability(campaign.projectId)).campaigns.find((c) => c.campaignId === campaign.id)
    : null;

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

      {canReadFinance && (
        <Card title="Profitability">
          {campaignProfitability ? (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">Budget</dt>
                <dd className="text-lg font-semibold">
                  {campaignProfitability.budgetCents === null ? "—" : money(campaignProfitability.budgetCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Actual spend</dt>
                <dd className="text-lg font-semibold">{money(campaignProfitability.actualCostCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Variance</dt>
                <dd
                  className={`text-lg font-semibold ${
                    campaignProfitability.varianceCents !== null && campaignProfitability.varianceCents < 0 ? "text-red-600" : ""
                  }`}
                >
                  {campaignProfitability.varianceCents === null ? "—" : money(campaignProfitability.varianceCents)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-neutral-400">No data available for this campaign.</p>
          )}
          {campaignProfitability?.actualCostCents === 0 && (
            <p className="mt-2 text-xs text-neutral-400">
              No expenses have been tagged to this campaign yet — log one on the client page and assign it to this
              campaign{campaignProfitability.budgetCents === null ? " (no budget set either, so variance shows as —)" : ""}.
            </p>
          )}
        </Card>
      )}

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
