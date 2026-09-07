import Link from "next/link";
import { notFound } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { PermissionDenied } from "@/components/PermissionDenied";
import { requireActor } from "@/lib/guards";
import { getPaginatedInvoices } from "@/lib/services/client-relations-service";
import { AddInvoiceForm } from "../AddInvoiceForm";
import { InvoiceActions } from "../InvoiceActions";

export const dynamic = "force-dynamic";

export default async function ClientInvoicesPage({
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
  if (!allowed) return <PermissionDenied message="You don't have access to this client's invoices." />;

  const canWriteFinance = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "finance:write",
  });

  const { items, page, totalPages, totalCount } = await getPaginatedInvoices(client.id, Number(pageParam) || 1);
  // Bounded: a project picker with hundreds of options wouldn't be usable
  // anyway, so this caps rather than paginating.
  const projects = await prisma.project.findMany({
    where: { clientId: client.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/clients/${client.id}`} className="text-xs text-cedar-700 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Invoices</h1>
        <p className="text-sm text-neutral-500">All invoices ever issued to {client.name} ({totalCount} total).</p>
      </div>

      <Card action={canWriteFinance && <AddInvoiceForm clientId={client.id} projects={projects} />}>
        {items.length === 0 ? (
          <p className="text-sm text-neutral-400">No invoices yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2">
                <span>{inv.issuedAt.toLocaleDateString()}</span>
                <span>${(inv.amountCents / 100).toLocaleString()}</span>
                <span className="text-xs text-neutral-500">{inv.status}</span>
                {canWriteFinance && <InvoiceActions invoiceId={inv.id} status={inv.status} />}
              </li>
            ))}
          </ul>
        )}
        <Pagination basePath={`/clients/${client.id}/invoices`} page={page} totalPages={totalPages} totalCount={totalCount} />
      </Card>
    </div>
  );
}
