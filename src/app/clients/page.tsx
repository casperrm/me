import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganization } from "@/lib/org";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-cedar-100 text-cedar-800",
  PROSPECT: "bg-amber-100 text-amber-800",
  PAUSED: "bg-neutral-100 text-neutral-600",
  CHURNED: "bg-red-100 text-red-700",
};

export default async function ClientsPage() {
  const org = await getCurrentOrganization();
  const clients = await prisma.client.findMany({
    where: { organizationId: org.id },
    include: { projects: true, brandDNA: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-sm text-neutral-500">
          One profile per client — brand, projects, files, approvals, billing (Section 2).
        </p>
      </div>

      {clients.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">
            No clients yet. Run <code>npm run db:seed</code> for demo data.
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
                      STATUS_STYLES[client.status] ?? "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {client.status}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-neutral-500">
                  <span>{client.projects.length} project(s)</span>
                  <span>{client.brandDNA ? "Brand DNA set" : "No Brand DNA yet"}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
