import { prisma } from "@cedar/db";
import { logger } from "@cedar/observability";

export interface HealthFactor {
  signal: string;
  value: string;
  penalty: number;
  explanation: string;
}

const APPROVAL_LATENCY_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Section 4.2: "Compute an explainable Client Health Score from
 * configurable signals such as delivery delays, unresolved issues,
 * approval latency, payment status, campaign trends, communication gaps,
 * satisfaction signals, and renewal proximity."
 *
 * Explicit scope boundary (see docs/specs/client-health.md): only the
 * signals with real, already-collected data behind them are computed —
 * delivery delays (overdue tasks/projects), payment status (overdue
 * unpaid invoices), approval latency (real Approval timestamps), and
 * unresolved issues (Quality Control failures on recent creative
 * versions — the closest real proxy this system has to "issues").
 * Campaign trends, communication gaps, satisfaction signals, and renewal
 * proximity all need modules that don't exist yet (real performance
 * metric ingestion, a messaging/CSAT model, contract/renewal dates) and
 * are never faked here. "Configurable" weights are fixed constants in
 * this file for now — a per-org configuration surface is a reasonable
 * later increment, not built yet.
 */
export async function computeHealthScoreForClient(clientId: string): Promise<{ score: number; factors: HealthFactor[] }> {
  const factors: HealthFactor[] = [];
  let score = 100;

  const overdueTasks = await prisma.task.count({
    where: { project: { clientId }, dueDate: { lt: new Date() }, status: { not: "done" } },
  });
  const taskPenalty = Math.min(overdueTasks * 5, 25);
  score -= taskPenalty;
  factors.push({
    signal: "delivery_delays_tasks",
    value: `${overdueTasks} overdue task(s)`,
    penalty: taskPenalty,
    explanation: "Tasks past their due date and not marked done.",
  });

  const overdueProjects = await prisma.project.count({
    where: { clientId, dueDate: { lt: new Date() }, status: { notIn: ["DELIVERED", "ARCHIVED"] } },
  });
  const projectPenalty = Math.min(overdueProjects * 10, 20);
  score -= projectPenalty;
  factors.push({
    signal: "delivery_delays_projects",
    value: `${overdueProjects} overdue project(s)`,
    penalty: projectPenalty,
    explanation: "Projects past their due date and not delivered or archived.",
  });

  const overdueInvoices = await prisma.invoice.count({
    where: { clientId, dueAt: { lt: new Date() }, status: { not: "PAID" } },
  });
  const invoicePenalty = Math.min(overdueInvoices * 15, 30);
  score -= invoicePenalty;
  factors.push({
    signal: "payment_status",
    value: `${overdueInvoices} overdue unpaid invoice(s)`,
    penalty: invoicePenalty,
    explanation: "Invoices past their due date that are not yet paid.",
  });

  const recentApprovals = await prisma.approval.findMany({
    where: {
      decision: { in: ["approved", "changes_requested", "canceled"] },
      createdAt: { gte: new Date(Date.now() - APPROVAL_LATENCY_LOOKBACK_MS) },
      creativeVersion: { creative: { campaign: { project: { clientId } } } },
    },
    include: { creativeVersion: { include: { approvals: { orderBy: { createdAt: "asc" } } } } },
  });
  const turnarounds = recentApprovals
    .map((decision) => {
      const requested = decision.creativeVersion.approvals.find((a) => a.decision === "requested");
      if (!requested) return null;
      return decision.createdAt.getTime() - requested.createdAt.getTime();
    })
    .filter((ms): ms is number => ms !== null && ms >= 0);
  const avgTurnaroundHours = turnarounds.length > 0 ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length / 3600000 : 0;
  const approvalPenalty = avgTurnaroundHours > 72 ? 10 : avgTurnaroundHours > 24 ? 5 : 0;
  score -= approvalPenalty;
  factors.push({
    signal: "approval_latency",
    value: turnarounds.length > 0 ? `${avgTurnaroundHours.toFixed(1)}h average turnaround` : "no recent decisions",
    penalty: approvalPenalty,
    explanation: "Average time from an approval request to its final decision, last 90 days.",
  });

  const recentQcResults = await prisma.qualityCheckResult.findMany({
    where: { creativeVersion: { creative: { campaign: { project: { clientId } } } } },
    orderBy: { createdAt: "desc" },
    distinct: ["creativeVersionId"],
    take: 20,
  });
  const qcFailCount = recentQcResults.filter((r) => r.overallStatus === "fail").length;
  const qcFailRate = recentQcResults.length > 0 ? qcFailCount / recentQcResults.length : 0;
  const qcPenalty = Math.round(qcFailRate * 20);
  score -= qcPenalty;
  factors.push({
    signal: "unresolved_issues_qc",
    value: recentQcResults.length > 0 ? `${qcFailCount}/${recentQcResults.length} recent Quality Control checks failed` : "no recent checks",
    penalty: qcPenalty,
    explanation: "Share of recent creative versions whose automatic Quality Control check failed.",
  });

  return { score: Math.max(0, Math.min(100, score)), factors };
}

export async function runHealthScoreJob(): Promise<number> {
  const clients = await prisma.client.findMany({ select: { id: true } });

  let computed = 0;
  for (const client of clients) {
    const { score, factors } = await computeHealthScoreForClient(client.id);
    await prisma.clientHealthScore.create({
      data: { clientId: client.id, score, factors: JSON.stringify(factors) },
    });
    computed += 1;
  }

  logger.info("health score job complete", { clientsScored: computed });
  return computed;
}
