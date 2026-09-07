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
 * building a service line-item model without a way to populate them would
 * just be unused schema, not a real feature. Project-level attribution
 * (see getProjectProfitability below) closes the project dimension of
 * that gap; service/campaign-level line items remain out of scope.
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
  const [clients, paidInvoices, expensesByClient, unattributedExpense] = await Promise.all([
    prisma.client.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.invoice.groupBy({
      by: ["clientId"],
      where: { client: { organizationId }, status: "PAID" },
      _sum: { amountCents: true },
    }),
    // Grouped in the database rather than pulled row-by-row — an
    // agency with years of expense history would otherwise load every
    // expense into memory just to sum a handful of numbers.
    prisma.expense.groupBy({
      by: ["clientId"],
      where: { organizationId, clientId: { not: null } },
      _sum: { amountCents: true },
    }),
    prisma.expense.aggregate({
      where: { organizationId, clientId: null },
      _sum: { amountCents: true },
    }),
  ]);

  const revenueByClient = new Map(paidInvoices.map((row) => [row.clientId, row._sum.amountCents ?? 0]));
  const costByClient = new Map(expensesByClient.map((row) => [row.clientId as string, row._sum.amountCents ?? 0]));
  const unattributedCostCents = unattributedExpense._sum.amountCents ?? 0;

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

export interface ProjectProfitability {
  projectId: string;
  projectName: string;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number | null;
}

/**
 * Section 4.2/16 Phase 5: project-level attribution within a client, now
 * that Invoice.projectId/Expense.projectId exist and both write paths
 * validate the tag. Mirrors getClientProfitability's shape one level
 * down: an invoice or expense with no projectId is real revenue/cost for
 * the client but isn't attributable to a specific project, so it's
 * reported as "unassigned" rather than guessed at or split evenly.
 */
export async function getProjectProfitability(clientId: string): Promise<{
  projects: ProjectProfitability[];
  unassignedRevenueCents: number;
  unassignedCostCents: number;
}> {
  const [projects, paidInvoicesByProject, unassignedInvoice, expensesByProject, unassignedExpense] =
    await Promise.all([
      prisma.project.findMany({ where: { clientId }, select: { id: true, name: true } }),
      prisma.invoice.groupBy({
        by: ["projectId"],
        where: { clientId, status: "PAID", projectId: { not: null } },
        _sum: { amountCents: true },
      }),
      prisma.invoice.aggregate({
        where: { clientId, status: "PAID", projectId: null },
        _sum: { amountCents: true },
      }),
      prisma.expense.groupBy({
        by: ["projectId"],
        where: { clientId, projectId: { not: null } },
        _sum: { amountCents: true },
      }),
      prisma.expense.aggregate({
        where: { clientId, projectId: null },
        _sum: { amountCents: true },
      }),
    ]);

  const revenueByProject = new Map(paidInvoicesByProject.map((row) => [row.projectId as string, row._sum.amountCents ?? 0]));
  const costByProject = new Map(expensesByProject.map((row) => [row.projectId as string, row._sum.amountCents ?? 0]));

  const results: ProjectProfitability[] = projects.map((project) => {
    const revenueCents = revenueByProject.get(project.id) ?? 0;
    const costCents = costByProject.get(project.id) ?? 0;
    const profitCents = revenueCents - costCents;
    return {
      projectId: project.id,
      projectName: project.name,
      revenueCents,
      costCents,
      profitCents,
      marginPct: computeMarginPct(profitCents, revenueCents),
    };
  });

  return {
    projects: results,
    unassignedRevenueCents: unassignedInvoice._sum.amountCents ?? 0,
    unassignedCostCents: unassignedExpense._sum.amountCents ?? 0,
  };
}
