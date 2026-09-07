import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { getPaginatedProjects } from "@/lib/services/client-relations-service";
import { NewProjectForm } from "../NewProjectForm";

export const dynamic = "force-dynamic";

export default async function ClientProjectsPage({
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
  if (!allowed) return <PermissionDenied message="You don't have access to this client's projects." />;

  const canWrite = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const { items, page, totalPages, totalCount } = await getPaginatedProjects(client.id, Number(pageParam) || 1);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${client.id}`} className="text-xs text-cedar-700 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-neutral-500">All projects ever created for {client.name} ({totalCount} total).</p>
      </div>

      <Card action={canWrite && <NewProjectForm clientId={client.id} />}>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-400">No projects yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={`/clients/${client.id}/projects/${p.id}`} className="block hover:text-cedar-700">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-neutral-500">{p.status}</span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    {p._count.campaigns} campaign(s) · {p._count.tasks} task(s)
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath={`/clients/${client.id}/projects`} page={page} totalPages={totalPages} totalCount={totalCount} />
      </Card>
    </div>
  );
}
