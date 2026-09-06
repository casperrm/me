import Link from "next/link";
import { prisma } from "@cedar/db";
import { isAuthorized } from "@cedar/auth";
import { Card } from "@/components/Card";
import { requireActor } from "@/lib/guards";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-cedar-100 text-cedar-800",
  PROSPECT: "bg-amber-100 text-amber-800",
  PAUSED: "bg-neutral-100 text-neutral-600",
  CHURNED: "bg-red-100 text-red-700",
};

export default async function ClientsPage() {
  const actor = await requireActor();

  // Section 38 acceptance scenario: a scoped collaborator only ever sees
  // the clients they've been granted, enforced here at the query layer —
  // not by fetching everything and hiding rows in the UI.
  const canReadAll = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
  });

  const clientIdFilter = canReadAll
    ? undefined
    : (
        await prisma.scopedGrant.findMany({
          where: { membershipId: actor.membership.id, permission: "clients:read", clientId: { not: null } },
          select: { clientId: true },
        })
      ).map((g) => g.clientId as string);

  const clients = await prisma.client.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(clientIdFilter ? { id: { in: clientIdFilter } } : {}),
    },
    include: { projects: true, brandProfile: true },
    orderBy: { name: "asc" },
  });

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
            {canReadAll
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
                  <span>{client.projects.length} project(s)</span>
                  <span>{client.brandProfile ? "Brand DNA set" : "No Brand DNA yet"}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
