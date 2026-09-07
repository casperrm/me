import Link from "next/link";
import { prisma } from "@cedar/db";
import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { requireActor } from "@/lib/guards";
import { getReadableClientIds } from "@/lib/readable-clients";

export const dynamic = "force-dynamic";

// Bounds the org-wide client list regardless of how many clients an
// organization accumulates (the Bible's own scale target is 500) —
// Phase 7 scale hardening; see docs/specs/opportunity-engine-scaling.md's
// sibling audit trail in docs/specs/dashboard-aggregates.md.
const PAGE_SIZE = 24;

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-cedar-100 text-cedar-800",
  PROSPECT: "bg-amber-100 text-amber-800",
  PAUSED: "bg-neutral-100 text-neutral-600",
  CHURNED: "bg-red-100 text-red-700",
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireActor();
  const { page: pageParam } = await searchParams;

  // Section 38 acceptance scenario: a scoped collaborator only ever sees
  // the clients they've been granted, enforced here at the query layer —
  // not by fetching everything and hiding rows in the UI.
  const clientIdFilter = await getReadableClientIds(actor);

  const where = {
    organizationId: actor.organizationId,
    ...(clientIdFilter ? { id: { in: clientIdFilter } } : {}),
  };

  const rawPage = Number(pageParam) || 1;
  const page = rawPage >= 1 ? Math.floor(rawPage) : 1;

  const [clients, totalCount] = await Promise.all([
    prisma.client.findMany({
      where,
      select: {
        id: true,
        name: true,
        companyName: true,
        lifecycleStage: true,
        brandProfile: { select: { id: true } },
        _count: { select: { projects: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.client.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-sm text-neutral-500">
          One profile per client — brand, projects, files, approvals, billing (Section 4).
        </p>
      </div>

      {clients.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">
            {clientIdFilter === undefined
              ? "No clients yet. Run npm run db:seed for demo data."
              : "You haven't been granted access to any clients yet — ask an owner or admin."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full transition hover:border-cedar-300 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{client.name}</div>
                    <div className="text-xs text-neutral-500">{client.companyName}</div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[client.lifecycleStage] ?? "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {client.lifecycleStage}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-neutral-500">
                  <span>{client._count.projects} project(s)</span>
                  <span>{client.brandProfile ? "Brand DNA set" : "No Brand DNA yet"}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Pagination basePath="/clients" page={page} totalPages={totalPages} totalCount={totalCount} />
    </div>
  );
}
