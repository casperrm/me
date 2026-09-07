import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { buildSignedDownloadPath } from "@/lib/storage";
import { AssetsList } from "../../../(app)/clients/[id]/AssetsList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function PortalFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { clientId } = await params;
  const { page: pageParam } = await searchParams;
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

  const rawPage = Number(pageParam) || 1;
  const page = rawPage >= 1 ? Math.floor(rawPage) : 1;

  const [assets, totalCount] = await Promise.all([
    prisma.asset.findMany({
      where: { clientId: client.id, status: "AVAILABLE" },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { include: { user: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.asset.count({ where: { clientId: client.id, status: "AVAILABLE" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/${client.id}`} className="text-xs text-neutral-400 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Files</h1>
        <p className="text-sm text-neutral-500">All files shared with {client.name} ({totalCount} total).</p>
      </div>

      <Card>
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
        <Pagination basePath={`/portal/${client.id}/files`} page={page} totalPages={totalPages} totalCount={totalCount} />
      </Card>
    </div>
  );
}
