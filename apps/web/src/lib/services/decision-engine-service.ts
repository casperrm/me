import { prisma } from "@cedar/db";
import { getClientProfitability } from "./profitability-service";
import { getOpportunitiesForClient } from "./opportunity-service";

export type RenewalCall = "renew" | "at_risk" | "do_not_renew";

export interface ClientRenewalRecommendation {
  recommendation: RenewalCall;
  evidence: string[];
  risks: string[];
  assumptions: string[];
  requiresApproval: true;
}

const RENEW_MAX_SCORE = 0;
const AT_RISK_MAX_SCORE = 2;

/**
 * Section 20 (Cedar Decision Engine): "For important decisions,
 * aggregate relevant operational, performance, financial, client, and
 * historical evidence. Return recommendation, alternatives, reasons,
 * risks, assumptions, expected impact, and required approvals. The
 * authorized human makes the final decision." Its own worked example
 * table names "Client renewal" with exactly this evidence: "profitability,
 * health score, delivery history, results, payment behavior, opportunity"
 * — every one of which was already a real, independently computed signal
 * elsewhere in this app (Client Health Score, getClientProfitability,
 * getOpportunitiesForClient, and the same overdue task/invoice queries
 * `apps/worker/src/jobs/escalations.ts` already uses) before this slice.
 * This is the first thing that turns them into one structured go/no-go
 * call instead of five separate numbers a human has to mentally combine.
 *
 * Deliberately deterministic, same "decision support, not autonomous
 * truth" stance as Client Health Score and the AI Business Advisor — no
 * AI call, so this works identically whether or not `ANTHROPIC_API_KEY`
 * is set. `requiresApproval: true` is not a UI hint; nothing in this
 * codebase acts on this recommendation automatically — Section 20's
 * "authorized human makes the final decision" is structural (no write
 * path exists here at all), not just a label.
 */
export async function getClientRenewalRecommendation(
  clientId: string,
  organizationId: string,
): Promise<ClientRenewalRecommendation> {
  // Authorization is the caller's responsibility here, matching every
  // other get*ForClient function in this codebase
  // (getOpportunitiesForClient, getRecentCedarBrainActivityForClient) —
  // each is always called from a page/route that already gated on
  // clients:read for this exact client, so a second, differently-shaped
  // check here would be redundant.
  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, organizationId },
    include: { healthScores: { orderBy: { computedAt: "desc" }, take: 1 } },
  });

  const now = new Date();
  const [profitability, opportunities, overdueInvoices, overdueTasks] = await Promise.all([
    getClientProfitability(organizationId).then((r) => r.clients.find((c) => c.clientId === clientId) ?? null),
    getOpportunitiesForClient(clientId, organizationId),
    prisma.invoice.findMany({ where: { clientId, dueAt: { lt: now }, status: { not: "PAID" } }, select: { amountCents: true } }),
    prisma.task.count({ where: { project: { clientId }, dueDate: { lt: now }, status: { not: "done" } } }),
  ]);

  const evidence: string[] = [];
  const risks: string[] = [];
  let riskScore = 0;

  const health = client.healthScores[0];
  if (health) {
    evidence.push(`Client Health Score: ${health.score}/100.`);
    if (health.score < 50) {
      risks.push(`Client Health Score is critical (${health.score}/100).`);
      riskScore += 2;
    } else if (health.score < 70) {
      risks.push(`Client Health Score is below a healthy threshold (${health.score}/100).`);
      riskScore += 1;
    }
  } else {
    evidence.push("No Client Health Score has been computed yet.");
  }

  // getClientProfitability returns a zeroed entry for every client in the
  // org, not null for one with no history — revenueCents === 0 &&
  // costCents === 0 is the real "nothing recorded yet" signal, distinct
  // from a client that has genuinely broken even.
  const hasProfitabilityData = profitability && (profitability.revenueCents !== 0 || profitability.costCents !== 0);
  if (hasProfitabilityData) {
    const profitDollars = (profitability.profitCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
    evidence.push(
      `Profitability: ${profitDollars}${profitability.marginPct !== null ? ` (${profitability.marginPct.toFixed(0)}% margin)` : ""}.`,
    );
    if (profitability.profitCents < 0) {
      risks.push(`Client is currently unprofitable (${profitDollars}).`);
      riskScore += 2;
    }
  } else {
    evidence.push("No profitability data recorded for this client (no paid invoices or expenses yet).");
  }

  if (overdueInvoices.length > 0) {
    const totalCents = overdueInvoices.reduce((sum, inv) => sum + inv.amountCents, 0);
    const totalDollars = (totalCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
    evidence.push(`Payment behavior: ${overdueInvoices.length} overdue unpaid invoice(s) totaling ${totalDollars}.`);
    risks.push(`${overdueInvoices.length} overdue unpaid invoice(s) (${totalDollars}) — collection risk.`);
    riskScore += 1;
  } else {
    evidence.push("Payment behavior: no overdue unpaid invoices.");
  }

  if (overdueTasks > 0) {
    evidence.push(`Delivery history: ${overdueTasks} currently overdue task(s).`);
    risks.push(`${overdueTasks} overdue task(s) — delivery risk.`);
    riskScore += 1;
  } else {
    evidence.push("Delivery history: no currently overdue tasks.");
  }

  evidence.push(
    opportunities.length > 0
      ? `Opportunity: ${opportunities.length} evidence-backed cross-sell/upsell gap(s) identified.`
      : "Opportunity: no cross-sell/upsell gaps currently identified.",
  );

  const recommendation: RenewalCall =
    riskScore <= RENEW_MAX_SCORE ? "renew" : riskScore <= AT_RISK_MAX_SCORE ? "at_risk" : "do_not_renew";

  return {
    recommendation,
    evidence,
    risks,
    assumptions: [
      "Based only on Client Health Score, profitability, payment behavior, delivery history, and cross-sell opportunity — this system has no model of strategic relationship value, contract terms, or market conditions, all of which a human deciding a real renewal must still weigh.",
      "Client Health Score itself already excludes campaign performance, satisfaction signals, and renewal proximity (no data source exists for any of those yet) — see docs/specs/client-health.md.",
    ],
    requiresApproval: true,
  };
}
