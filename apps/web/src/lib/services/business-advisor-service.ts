import { prisma } from "@cedar/db";
import { getClientProfitability } from "./profitability-service";
import { getOpportunitiesForClient } from "./opportunity-service";

export interface UnprofitableEngagement {
  clientId: string;
  clientName: string;
  profitCents: number;
  marginPct: number | null;
}

export interface CostLeakageItem {
  category: string;
  amountCents: number;
  shareOfTotalPct: number;
}

export interface StrongService {
  service: string;
  profitableClientCount: number;
  totalClientCount: number;
}

export interface CapacityRisk {
  membershipId: string;
  memberName: string;
  openTaskCount: number;
  overdueTaskCount: number;
}

export interface CollectionRisk {
  clientId: string;
  clientName: string;
  overdueInvoiceCount: number;
  overdueAmountCents: number;
}

export interface UpsellRollupItem {
  type: "service_gap" | "creative_format_gap";
  label: string;
  clientCount: number;
}

export interface BusinessAdvisorBriefing {
  unprofitableEngagements: UnprofitableEngagement[];
  costLeakage: CostLeakageItem[];
  strongServices: StrongService[];
  capacityRisks: CapacityRisk[];
  collectionRisks: CollectionRisk[];
  upsellRollup: UpsellRollupItem[];
}

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Same evidence discipline as the Opportunity Engine (opportunity-service.ts)
// and Client Health Score: a signal only counts once there's more than one
// data point behind it.
const MIN_CLIENTS_FOR_SERVICE_SIGNAL = 2;
const CAPACITY_OPEN_TASK_THRESHOLD = 5;
const CAPACITY_OVERDUE_TASK_THRESHOLD = 3;
const TOP_COST_CATEGORIES = 5;
const TOP_UPSELL_ITEMS = 5;

/**
 * Section 16.2: "AI Business Advisor: explain profitability, identify cost
 * leakage, unprofitable engagements, strong services, capacity risks,
 * collection risks, and evidence-backed upsell opportunities.
 * Recommendations must expose assumptions and underlying metrics."
 *
 * Every field here is a real aggregate over already-collected data — no
 * signal is invented, and every entry carries the literal count/amount
 * that produced it so a human can verify the "why" (Section 4.2's
 * decision-support framing applies here too). See
 * docs/specs/business-advisor.md for the exact scope boundary: this is
 * the deterministic data layer. Any AI-generated narrative wrapping it
 * (business-advisor-narrative.ts) must only restate these numbers, never
 * add unsupported claims.
 */
export async function getBusinessAdvisorBriefing(organizationId: string): Promise<BusinessAdvisorBriefing> {
  const [profitability, expenses, clients, overdueInvoices] = await Promise.all([
    getClientProfitability(organizationId),
    prisma.expense.findMany({ where: { organizationId }, select: { category: true, amountCents: true } }),
    prisma.client.findMany({ where: { organizationId }, select: { id: true, name: true, services: true } }),
    prisma.invoice.findMany({
      where: { client: { organizationId }, dueAt: { lt: new Date() }, status: { not: "PAID" } },
      select: { clientId: true, amountCents: true, client: { select: { name: true } } },
    }),
  ]);

  // Unprofitable engagements: real client profit, sorted worst-first.
  const unprofitableEngagements: UnprofitableEngagement[] = profitability.clients
    .filter((c) => c.profitCents < 0)
    .sort((a, b) => a.profitCents - b.profitCents)
    .map((c) => ({ clientId: c.clientId, clientName: c.clientName, profitCents: c.profitCents, marginPct: c.marginPct }));

  // Cost leakage: which expense categories make up the largest share of spend.
  const totalExpenseCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountCents);
  }
  const costLeakage: CostLeakageItem[] = Array.from(byCategory.entries())
    .map(([category, amountCents]) => ({
      category,
      amountCents,
      shareOfTotalPct: totalExpenseCents > 0 ? (amountCents / totalExpenseCents) * 100 : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, TOP_COST_CATEGORIES);

  // Strong services: services shared by clients who are actually profitable.
  const profitableClientIds = new Set(profitability.clients.filter((c) => c.profitCents > 0).map((c) => c.clientId));
  const serviceTotalCounts = new Map<string, number>();
  const serviceProfitableCounts = new Map<string, number>();
  for (const client of clients) {
    const services = parseJSON<string[]>(client.services, []);
    for (const service of services) {
      serviceTotalCounts.set(service, (serviceTotalCounts.get(service) ?? 0) + 1);
      if (profitableClientIds.has(client.id)) {
        serviceProfitableCounts.set(service, (serviceProfitableCounts.get(service) ?? 0) + 1);
      }
    }
  }
  const strongServices: StrongService[] = Array.from(serviceTotalCounts.entries())
    .filter(([, totalCount]) => totalCount >= MIN_CLIENTS_FOR_SERVICE_SIGNAL)
    .map(([service, totalClientCount]) => ({
      service,
      profitableClientCount: serviceProfitableCounts.get(service) ?? 0,
      totalClientCount,
    }))
    .sort((a, b) => b.profitableClientCount - a.profitableClientCount);

  // Capacity risks: team members carrying a disproportionate open/overdue task load.
  const clientIds = clients.map((c) => c.id);
  const tasksByAssignee = await prisma.task.findMany({
    where: { project: { clientId: { in: clientIds } }, status: { not: "done" } },
    select: {
      assigneeId: true,
      dueDate: true,
      assignee: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  const capacityByMember = new Map<string, { memberName: string; openTaskCount: number; overdueTaskCount: number }>();
  const now = new Date();
  for (const task of tasksByAssignee) {
    if (!task.assigneeId || !task.assignee) continue;
    const entry = capacityByMember.get(task.assigneeId) ?? {
      memberName: task.assignee.user.name,
      openTaskCount: 0,
      overdueTaskCount: 0,
    };
    entry.openTaskCount += 1;
    if (task.dueDate && task.dueDate < now) entry.overdueTaskCount += 1;
    capacityByMember.set(task.assigneeId, entry);
  }
  const capacityRisks: CapacityRisk[] = Array.from(capacityByMember.entries())
    .filter(
      ([, v]) => v.openTaskCount >= CAPACITY_OPEN_TASK_THRESHOLD || v.overdueTaskCount >= CAPACITY_OVERDUE_TASK_THRESHOLD,
    )
    .map(([membershipId, v]) => ({ membershipId, ...v }))
    .sort((a, b) => b.overdueTaskCount - a.overdueTaskCount || b.openTaskCount - a.openTaskCount);

  // Collection risks: real overdue unpaid invoices, grouped by client.
  const collectionByClient = new Map<string, { clientName: string; overdueInvoiceCount: number; overdueAmountCents: number }>();
  for (const invoice of overdueInvoices) {
    const entry = collectionByClient.get(invoice.clientId) ?? {
      clientName: invoice.client.name,
      overdueInvoiceCount: 0,
      overdueAmountCents: 0,
    };
    entry.overdueInvoiceCount += 1;
    entry.overdueAmountCents += invoice.amountCents;
    collectionByClient.set(invoice.clientId, entry);
  }
  const collectionRisks: CollectionRisk[] = Array.from(collectionByClient.entries())
    .map(([clientId, v]) => ({ clientId, ...v }))
    .sort((a, b) => b.overdueAmountCents - a.overdueAmountCents);

  // Upsell rollup: how many distinct clients each evidence-backed gap (Opportunity
  // Engine) applies to, across the whole organization.
  const upsellCounts = new Map<string, { type: UpsellRollupItem["type"]; label: string; clientCount: number }>();
  for (const client of clients) {
    const opportunities = await getOpportunitiesForClient(client.id, organizationId);
    for (const opportunity of opportunities) {
      const key = `${opportunity.type}:${opportunity.label}`;
      const entry = upsellCounts.get(key) ?? { type: opportunity.type, label: opportunity.label, clientCount: 0 };
      entry.clientCount += 1;
      upsellCounts.set(key, entry);
    }
  }
  const upsellRollup: UpsellRollupItem[] = Array.from(upsellCounts.values())
    .sort((a, b) => b.clientCount - a.clientCount)
    .slice(0, TOP_UPSELL_ITEMS);

  return { unprofitableEngagements, costLeakage, strongServices, capacityRisks, collectionRisks, upsellRollup };
}
