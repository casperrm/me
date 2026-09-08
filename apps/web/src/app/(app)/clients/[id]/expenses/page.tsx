import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { getPaginatedExpenses } from "@/lib/services/client-relations-service";
import { AddExpenseForm } from "../AddExpenseForm";

export const dynamic = "force-dynamic";

export default async function ClientExpensesPage({
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
  if (!allowed) return <PermissionDenied message="You don't have access to this client's expenses." />;

  const canWriteFinance = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "finance:write",
  });

  const { items, page, totalPages, totalCount } = await getPaginatedExpenses(client.id, Number(pageParam) || 1);
  // Bounded: a project picker with hundreds of options wouldn't be usable
  // anyway, so this caps rather than paginating.
  const projects = await prisma.project.findMany({
    where: { clientId: client.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  const campaigns = await prisma.campaign.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { id: true, name: true, projectId: true },
    orderBy: { name: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${client.id}`} className="text-xs text-cedar-700 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Expenses</h1>
        <p className="text-sm text-neutral-500">All expenses ever logged against {client.name} ({totalCount} total).</p>
      </div>

      <Card action={canWriteFinance && <AddExpenseForm clientId={client.id} projects={projects} campaigns={campaigns} />}>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-400">No expenses logged against this client yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((exp) => (
              <li key={exp.id} className="flex justify-between">
                <span>
                  {exp.incurredAt.toLocaleDateString()} — {exp.category}
                </span>
                <span>${(exp.amountCents / 100).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath={`/clients/${client.id}/expenses`} page={page} totalPages={totalPages} totalCount={totalCount} />
      </Card>
    </div>
  );
}
