import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { buildSignedDownloadPath } from "@/lib/storage";
import { getPaginatedAssets } from "@/lib/services/client-relations-service";
import { AssetUploadForm } from "../AssetUploadForm";
import { AssetsList } from "../AssetsList";

export const dynamic = "force-dynamic";

export default async function ClientFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const actor = await requireActor();

  const client = await prisma.client.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!client) notFound();

  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
    clientId: client.id,
  });
  if (!allowed) return <PermissionDenied message="You don't have access to this client's files." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const { items, page, totalPages, totalCount } = await getPaginatedAssets(client.id, Number(pageParam) || 1);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${client.id}`} className="text-xs text-cedar-700 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Files</h1>
        <p className="text-sm text-neutral-500">All files ever uploaded for {client.name} ({totalCount} total).</p>
      </div>

      <Card action={canWrite && <AssetUploadForm clientId={client.id} />}>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-400">No files uploaded yet.</p>
        ) : (
          <AssetsList
            canWrite={canWrite}
            assets={items.map((a) => ({
              id: a.id,
              filename: a.filename,
              sizeBytes: a.sizeBytes,
              downloadUrl: buildSignedDownloadPath(a.id),
              uploadedByName: a.uploadedBy?.user.name ?? null,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        )}
        <Pagination basePath={`/clients/${client.id}/files`} page={page} totalPages={totalPages} totalCount={totalCount} />
      </Card>
    </div>
  );
}
