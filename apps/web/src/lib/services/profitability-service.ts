import { prisma } from "@cedar/db";
import { computeMarginPct } from "@cedar/metrics";

export interface ClientProfitability {
  clientId: string;
  clientName: string;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number | null; // null when revenue is 0 — a percentage of nothing isn't meaningful
}

/**
 * Section 4.2/16: "profitability attribution by project/service/campaign."
 *
 * Explicit scope boundary — only client-level attribution is built here.
 * Revenue is real (Invoice.clientId already exists); cost is real
 * (Expense.clientId, added this slice). Project/campaign/service-level
 * attribution would need Invoice.projectId and Expense.projectId (agencies
 * would need to actually tag invoices/expenses at that granularity, which
 * no UI supports yet) and a real service line-item model on invoices
 * (Client.services is just a tag list, not billable line items) —
 * building those fields without a way to populate them would just be
 * unused schema, not a real feature. Client-level is the one cut that's
 * fully real and usable today.
 *
 * Revenue counts only PAID invoices — an unpaid or draft invoice isn't
 * recognized revenue. Expenses with no clientId are org-wide overhead
 * (software, general contractors) and are surfaced as a separate
 * "unattributed" total, never guessed at or evenly split across clients.
 */
export async function getClientProfitability(organizationId: string): Promise<{
  clients: ClientProfitability[];
  unattributedCostCents: number;
}> {
  const [clients, paidInvoices, expenses] = await Promise.all([
    prisma.client.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.invoice.groupBy({
      by: ["clientId"],
      where: { client: { organizationId }, status: "PAID" },
      _sum: { amountCents: true },
    }),
    prisma.expense.findMany({ where: { organizationId } }),
  ]);

  const revenueByClient = new Map(paidInvoices.map((row) => [row.clientId, row._sum.amountCents ?? 0]));
  const costByClient = new Map<string, number>();
  let unattributedCostCents = 0;
  for (const expense of expenses) {
    if (!expense.clientId) {
      unattributedCostCents += expense.amountCents;
      continue;
    }
    costByClient.set(expense.clientId, (costByClient.get(expense.clientId) ?? 0) + expense.amountCents);
  }

  const results: ClientProfitability[] = clients.map((client) => {
    const revenueCents = revenueByClient.get(client.id) ?? 0;
    const costCents = costByClient.get(client.id) ?? 0;
    const profitCents = revenueCents - costCents;
    return {
      clientId: client.id,
      clientName: client.name,
      revenueCents,
      costCents,
      profitCents,
      marginPct: computeMarginPct(profitCents, revenueCents),
    };
  });

  return { clients: results, unattributedCostCents };
}
