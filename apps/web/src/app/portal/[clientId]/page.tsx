import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { buildSignedDownloadPath } from "@/lib/storage";
import { AssetsList } from "../../(app)/clients/[id]/AssetsList";
import { PortalDecideForm } from "./PortalDecideForm";

export const dynamic = "force-dynamic";

// The curated Client Portal view (Bible Section 15.2): "Client sees only
// explicitly shared resources within their client scope. Review
// designs/videos/content, comment, approve/request changes, view
// reports/invoices/files where enabled." This page deliberately renders
// a NARROW subset of what the internal client profile page shows — no
// internal notes, no Client Health Score, no Brand DNA internals, no
// campaign budgets/KPIs, and (because every query below is filtered by
// this one clientId) never another client's data.
export default async function PortalClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const actor = await requireActor();

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: actor.organizationId },
    select: { id: true, name: true },
  });
  if (!client) notFound();

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId: client.id,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this client's portal." />;

  const canDecide = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "approvals:decide",
    clientId: client.id,
  });

  const [creatives, invoices, assets] = await Promise.all([
    prisma.creative.findMany({
      where: {
        status: { in: ["PENDING_APPROVAL", "APPROVED"] },
        campaign: { project: { clientId: client.id } },
      },
      include: {
        campaign: { select: { name: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { asset: true, approvals: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({ where: { clientId: client.id }, orderBy: { issuedAt: "desc" } }),
    prisma.asset.findMany({
      where: { clientId: client.id, status: "AVAILABLE" },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { include: { user: true } } },
    }),
  ]);

  const pending = creatives.filter((c) => c.status === "PENDING_APPROVAL");
  const approved = creatives.filter((c) => c.status === "APPROVED");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal" className="text-xs text-neutral-400 hover:underline">
          ← All clients
        </Link>
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <p className="text-sm text-neutral-500">Approvals, files, and invoices shared with you.</p>
      </div>

      <Card title="Pending your review">
        {pending.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing is waiting on you right now.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((creative) => {
              const version = creative.versions[0];
              return (
                <li key={creative.id} className="border-b border-neutral-50 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {creative.campaign.name} — {creative.type}
                      {creative.platform ? ` (${creative.platform})` : ""}
                    </span>
                    <span className="text-xs text-neutral-400">v{creative.currentVersion}</span>
                  </div>
                  {version?.notes && <p className="mt-1 text-sm text-neutral-600">{version.notes}</p>}
                  {version?.asset && (
                    <a
                      href={buildSignedDownloadPath(version.asset.id)}
                      className="mt-1 inline-block text-sm text-cedar-700 hover:underline"
                    >
                      View {version.asset.filename}
                    </a>
                  )}
                  {canDecide && version ? (
                    <PortalDecideForm creativeVersionId={version.id} />
                  ) : (
                    <p className="mt-2 text-xs text-neutral-400">
                      You don&apos;t have permission to decide on approvals for this client.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Approved history">
        {approved.length === 0 ? (
          <p className="text-sm text-neutral-400">No approved creative yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {approved.map((creative) => {
              const decidedAt = creative.versions[0]?.approvals[0]?.createdAt;
              return (
                <li key={creative.id} className="flex items-center justify-between">
                  <span>
                    {creative.campaign.name} — {creative.type}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {decidedAt ? `Approved ${decidedAt.toLocaleDateString()}` : "Approved"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Invoices">
        {invoices.length === 0 ? (
          <p className="text-sm text-neutral-400">No invoices yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex justify-between">
                <span>{inv.issuedAt.toLocaleDateString()}</span>
                <span>${(inv.amountCents / 100).toLocaleString()}</span>
                <span className="text-xs text-neutral-500">{inv.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Files">
        {assets.length === 0 ? (
          <p className="text-sm text-neutral-400">No files shared yet.</p>
        ) : (
          <AssetsList
            canWrite={false}
            assets={assets.map((a) => ({
              id: a.id,
              filename: a.filename,
              sizeBytes: a.sizeBytes,
              downloadUrl: buildSignedDownloadPath(a.id),
              uploadedByName: a.uploadedBy?.user.name ?? null,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        )}
      </Card>
    </div>
  );
}
