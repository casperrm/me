import Link from "next/link";
import { prisma } from "@cedar/db";
import { Card, StatCard } from "@/components/Card";
import { checkPermission } from "@/lib/guards";
import { PermissionDenied } from "@/components/PermissionDenied";
import { getClientProfitability } from "@/lib/services/profitability-service";
import { getBusinessAdvisorBriefing } from "@/lib/services/business-advisor-service";
import { generateBusinessAdvisorNarrative } from "@/lib/business-advisor-narrative";

// Dashboard figures must always reflect current data, not a build-time snapshot.
export const dynamic = "force-dynamic";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

export default async function DashboardPage() {
  // The CEO Dashboard is fundamentally a financial + operational overview
  // (Bible Section 16.1) — gate it on finance:read rather than showing a
  // scoped collaborator a company-wide revenue figure they have no
  // business seeing. Their working view is /clients.
  const { allowed, actor } = await checkPermission("finance:read");
  if (!allowed || !actor) {
    return (
      <PermissionDenied message="The CEO Dashboard shows organization-wide financials. Try Clients instead, or ask an owner for the Finance role." />
    );
  }

  const organizationId = actor.organizationId;

  const [clients, invoices, expenses, pendingApprovals, delayedProjects, recentTimeline, profitability] =
    await Promise.all([
      prisma.client.findMany({ where: { organizationId } }),
      prisma.invoice.findMany({ where: { client: { organizationId } } }),
      prisma.expense.findMany({ where: { organizationId } }),
      prisma.creative.count({ where: { status: "PENDING_APPROVAL" } }),
      prisma.project.findMany({
        where: {
          client: { organizationId },
          status: { in: ["PLANNING", "IN_PROGRESS", "IN_REVIEW"] },
          dueDate: { lt: new Date() },
        },
        include: { client: true },
      }),
      prisma.clientTimelineEvent.findMany({
        where: { client: { organizationId } },
        orderBy: { occurredAt: "desc" },
        take: 6,
        include: { client: true },
      }),
      getClientProfitability(organizationId),
    ]);

  const advisorBriefing = await getBusinessAdvisorBriefing(organizationId);
  const advisorNarrative = await generateBusinessAdvisorNarrative(advisorBriefing);

  const revenueCents = invoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + i.amountCents, 0);
  const outstandingCents = invoices
    .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + i.amountCents, 0);
  const expensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const activeClients = clients.filter((c) => c.lifecycleStage === "ACTIVE").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">CEO Dashboard</h1>
        <p className="text-sm text-neutral-500">
          {actor.membership.organization.name} — everything worth knowing, in one screen (Section 16.1).
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

      <Card
        title="Client profitability"
        action={<span className="text-xs text-neutral-400">Paid invoices minus attributed expenses (Section 4.2/16)</span>}
      >
        {profitability.clients.every((c) => c.revenueCents === 0 && c.costCents === 0) ? (
          <p className="text-sm text-neutral-400">No paid invoices or logged expenses yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs text-neutral-500">
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4">Revenue</th>
                  <th className="pb-2 pr-4">Cost</th>
                  <th className="pb-2 pr-4">Profit</th>
                  <th className="pb-2">Margin</th>
                </tr>
              </thead>
              <tbody>
                {profitability.clients
                  .filter((c) => c.revenueCents > 0 || c.costCents > 0)
                  .sort((a, b) => b.profitCents - a.profitCents)
                  .map((c) => (
                    <tr key={c.clientId} className="border-b border-neutral-50">
                      <td className="py-2 pr-4">
                        <Link href={`/clients/${c.clientId}`} className="hover:underline">
                          {c.clientName}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{money(c.revenueCents)}</td>
                      <td className="py-2 pr-4">{money(c.costCents)}</td>
                      <td className={`py-2 pr-4 ${c.profitCents < 0 ? "text-red-600" : ""}`}>{money(c.profitCents)}</td>
                      <td className="py-2">{c.marginPct !== null ? `${c.marginPct.toFixed(0)}%` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {profitability.unattributedCostCents > 0 && (
          <p className="mt-3 text-xs text-neutral-400">
            {money(profitability.unattributedCostCents)} in expenses aren&apos;t attributed to a specific client (general
            overhead).
          </p>
        )}
      </Card>

      <Card
        title="AI Business Advisor"
        action={
          <span className="text-xs text-neutral-400">
            {advisorNarrative.mode === "live" ? "AI narrative" : "Deterministic summary — set ANTHROPIC_API_KEY for AI narrative"} (Section 16.2)
          </span>
        }
      >
        <p className="text-sm text-neutral-700">{advisorNarrative.text}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Unprofitable engagements</h4>
            {advisorBriefing.unprofitableEngagements.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-400">None.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {advisorBriefing.unprofitableEngagements.map((e) => (
                  <li key={e.clientId} className="flex justify-between">
                    <Link href={`/clients/${e.clientId}`} className="hover:underline">
                      {e.clientName}
                    </Link>
                    <span className="text-red-600">{money(e.profitCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Cost leakage</h4>
            {advisorBriefing.costLeakage.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-400">No expenses logged yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {advisorBriefing.costLeakage.map((c) => (
                  <li key={c.category} className="flex justify-between">
                    <span>{c.category}</span>
                    <span className="text-neutral-500">
                      {money(c.amountCents)} ({c.shareOfTotalPct.toFixed(0)}%)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Strong services</h4>
            {advisorBriefing.strongServices.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-400">Not enough data yet (needs 2+ clients sharing a service).</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {advisorBriefing.strongServices.map((s) => (
                  <li key={s.service} className="flex justify-between">
                    <span>{s.service}</span>
                    <span className="text-neutral-500">
                      {s.profitableClientCount}/{s.totalClientCount} clients profitable
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Capacity risks</h4>
            {advisorBriefing.capacityRisks.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-400">No team member is overloaded.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {advisorBriefing.capacityRisks.map((r) => (
                  <li key={r.membershipId} className="flex justify-between">
                    <span>{r.memberName}</span>
                    <span className="text-neutral-500">
                      {r.openTaskCount} open, {r.overdueTaskCount} overdue
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Collection risks</h4>
            {advisorBriefing.collectionRisks.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-400">No overdue unpaid invoices.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {advisorBriefing.collectionRisks.map((r) => (
                  <li key={r.clientId} className="flex justify-between">
                    <Link href={`/clients/${r.clientId}`} className="hover:underline">
                      {r.clientName}
                    </Link>
                    <span className="text-neutral-500">
                      {money(r.overdueAmountCents)} ({r.overdueInvoiceCount})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Upsell signals</h4>
            {advisorBriefing.upsellRollup.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-400">No cross-client gaps found yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {advisorBriefing.upsellRollup.map((u) => (
                  <li key={`${u.type}-${u.label}`} className="flex justify-between">
                    <span>{u.label}</span>
                    <span className="text-neutral-500">{u.clientCount} client(s)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
