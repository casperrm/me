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

// This is the external-facing surface (Bible Section 15.2) — real
// customer-visible latency risk as a portal client's history grows, so
// each list here is bounded to a recent preview with a "View all" link
// to a dedicated paginated page, same pattern as the internal client
// detail page (Phase 7 scale hardening; see
// docs/specs/client-portal-pagination.md). "Pending your review" is the
// one exception: it's a live work queue a client is expected to clear
// to zero, not a growing archive, so it gets a defensive cap instead of
// a "view all" page — there's nothing to page through once it's a
// queue rather than a history.
const PREVIEW_LIMIT = 10;
const PENDING_CAP = 50;

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

  const creativeInclude = {
    campaign: { select: { name: true } },
    versions: {
      orderBy: { version: "desc" as const },
      take: 1,
      include: { asset: true, approvals: { orderBy: { createdAt: "desc" as const }, take: 1 } },
    },
  };

  const [pending, approved, approvedCount, invoices, invoicesCount, assets, assetsCount] = await Promise.all([
    prisma.creative.findMany({
      where: { status: "PENDING_APPROVAL", campaign: { project: { clientId: client.id } } },
      include: creativeInclude,
      orderBy: { createdAt: "desc" },
      take: PENDING_CAP,
    }),
    prisma.creative.findMany({
      where: { status: "APPROVED", campaign: { project: { clientId: client.id } } },
      include: creativeInclude,
      orderBy: { createdAt: "desc" },
      take: PREVIEW_LIMIT,
    }),
    prisma.creative.count({ where: { status: "APPROVED", campaign: { project: { clientId: client.id } } } }),
    prisma.invoice.findMany({ where: { clientId: client.id }, orderBy: { issuedAt: "desc" }, take: PREVIEW_LIMIT }),
    prisma.invoice.count({ where: { clientId: client.id } }),
    prisma.asset.findMany({
      where: { clientId: client.id, status: "AVAILABLE" },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { include: { user: true } } },
      take: PREVIEW_LIMIT,
    }),
    prisma.asset.count({ where: { clientId: client.id, status: "AVAILABLE" } }),
  ]);

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

      <Card
        title="Approved history"
        action={
          approvedCount > approved.length && (
            <Link href={`/portal/${client.id}/approved`} className="text-xs text-cedar-700 hover:underline">
              View all ({approvedCount})
            </Link>
          )
        }
      >
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

      <Card
        title="Invoices"
        action={
          invoicesCount > invoices.length && (
            <Link href={`/portal/${client.id}/invoices`} className="text-xs text-cedar-700 hover:underline">
              View all ({invoicesCount})
            </Link>
          )
        }
      >
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

      <Card
        title="Files"
        action={
          assetsCount > assets.length && (
            <Link href={`/portal/${client.id}/files`} className="text-xs text-cedar-700 hover:underline">
              View all ({assetsCount})
            </Link>
          )
        }
      >
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
