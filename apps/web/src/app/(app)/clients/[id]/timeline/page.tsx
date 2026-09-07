import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { getPaginatedTimelineEvents } from "@/lib/services/client-relations-service";

export const dynamic = "force-dynamic";

export default async function ClientTimelinePage({
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
  if (!allowed) return <PermissionDenied message="You don't have access to this client's timeline." />;

  const { items, page, totalPages, totalCount } = await getPaginatedTimelineEvents(client.id, Number(pageParam) || 1);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${client.id}`} className="text-xs text-cedar-700 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Client timeline</h1>
        <p className="text-sm text-neutral-500">Full history recorded for {client.name} ({totalCount} events).</p>
      </div>

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-400">No history recorded yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-neutral-200 pl-4">
            {items.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="text-xs text-neutral-400">{e.occurredAt.toLocaleDateString()}</div>
                <div>{e.summary}</div>
              </li>
            ))}
          </ol>
        )}
        <Pagination basePath={`/clients/${client.id}/timeline`} page={page} totalPages={totalPages} totalCount={totalCount} />
      </Card>
    </div>
  );
}
