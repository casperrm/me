import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function PortalApprovedHistoryPage({
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

  const [approved, totalCount] = await Promise.all([
    prisma.creative.findMany({
      where: { status: "APPROVED", campaign: { project: { clientId: client.id } } },
      include: {
        campaign: { select: { name: true } },
        versions: { orderBy: { version: "desc" }, take: 1, include: { approvals: { orderBy: { createdAt: "desc" }, take: 1 } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.creative.count({ where: { status: "APPROVED", campaign: { project: { clientId: client.id } } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/${client.id}`} className="text-xs text-neutral-400 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Approved history</h1>
        <p className="text-sm text-neutral-500">Everything approved for {client.name} ({totalCount} total).</p>
      </div>

      <Card>
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
        <Pagination basePath={`/portal/${client.id}/approved`} page={page} totalPages={totalPages} totalCount={totalCount} />
      </Card>
    </div>
  );
}
