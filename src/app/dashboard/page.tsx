import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganization } from "@/lib/org";
import { Card, StatCard } from "@/components/Card";

// Dashboard figures must always reflect current data, not a build-time snapshot.
export const dynamic = "force-dynamic";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

export default async function DashboardPage() {
  const org = await getCurrentOrganization();

  const [clients, invoices, expenses, pendingApprovals, delayedProjects, recentTimeline] =
    await Promise.all([
      prisma.client.findMany({ where: { organizationId: org.id } }),
      prisma.invoice.findMany({ where: { client: { organizationId: org.id } } }),
      prisma.expense.findMany({ where: { organizationId: org.id } }),
      prisma.creative.count({ where: { status: "PENDING_APPROVAL" } }),
      prisma.project.findMany({
        where: {
          client: { organizationId: org.id },
          status: { in: ["PLANNING", "IN_PROGRESS", "IN_REVIEW"] },
          dueDate: { lt: new Date() },
        },
        include: { client: true },
      }),
      prisma.clientTimelineEvent.findMany({
        where: { client: { organizationId: org.id } },
        orderBy: { occurredAt: "desc" },
        take: 6,
        include: { client: true },
      }),
    ]);

  const revenueCents = invoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + i.amountCents, 0);
  const outstandingCents = invoices
    .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + i.amountCents, 0);
  const expensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const activeClients = clients.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">CEO Dashboard</h1>
        <p className="text-sm text-neutral-500">
          {org.name} — everything worth knowing, in one screen (Section 18).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Revenue (paid)" value={money(revenueCents)} />
        <StatCard label="Outstanding" value={money(outstandingCents)} hint="Sent + overdue invoices" />
        <StatCard label="Expenses" value={money(expensesCents)} />
        <StatCard label="Net" value={money(revenueCents - expensesCents)} />
        <StatCard label="Active clients" value={String(activeClients)} hint={`${clients.length} total`} />
        <StatCard label="Pending approvals" value={String(pendingApprovals)} />
        <StatCard label="Delayed projects" value={String(delayedProjects.length)} />
        <StatCard label="Cedar Intelligence alerts" value="0" hint="No alert feed wired up yet" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Delayed projects">
          {delayedProjects.length === 0 ? (
            <p className="text-sm text-neutral-400">Nothing overdue.</p>
          ) : (
            <ul className="space-y-2">
              {delayedProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span>
                    {p.name} <span className="text-neutral-400">— {p.client.name}</span>
                  </span>
                  <span className="text-xs text-red-600">
                    due {p.dueDate?.toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent client activity">
          {recentTimeline.length === 0 ? (
            <p className="text-sm text-neutral-400">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentTimeline.map((e) => (
                <li key={e.id} className="text-sm">
                  <Link href={`/clients/${e.clientId}`} className="font-medium hover:underline">
                    {e.client.name}
                  </Link>{" "}
                  <span className="text-neutral-500">— {e.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
