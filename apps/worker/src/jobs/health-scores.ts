import { prisma } from "@cedar/db";
import { logger } from "@cedar/observability";
import {
  approvalLatencyPenalty,
  clampHealthScore,
  HEALTH_SCORE_BASE,
  meetingCadencePenalty,
  overdueInvoicePenalty,
  overdueProjectPenalty,
  overdueTaskPenalty,
  qcFailRatePenalty,
} from "@cedar/metrics";

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
 * unpaid invoices), approval latency (real Approval timestamps),
 * unresolved issues (Quality Control failures on recent creative
 * versions — the closest real proxy this system has to "issues"), and
 * — since the Meetings module (Section 13) shipped — meeting cadence, a
 * partial, honest proxy for "communication gaps": days since the
 * client's last recorded meeting, not full communication tracking (no
 * messaging/call-log model exists). Campaign trends, satisfaction
 * signals, and renewal proximity all still need modules that don't
 * exist yet (real performance metric ingestion, a CSAT model, contract/
 * renewal dates) and are never faked here. "Configurable" weights are
 * fixed constants in this file for now — a per-org configuration
 * surface is a reasonable later increment, not built yet.
 */
export async function computeHealthScoreForClient(clientId: string): Promise<{ score: number; factors: HealthFactor[] }> {
  const factors: HealthFactor[] = [];
  let score = HEALTH_SCORE_BASE;

  const overdueTasks = await prisma.task.count({
    where: { project: { clientId }, dueDate: { lt: new Date() }, status: { not: "done" } },
  });
  const taskPenalty = overdueTaskPenalty(overdueTasks);
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
  const projectPenalty = overdueProjectPenalty(overdueProjects);
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
  const invoicePenalty = overdueInvoicePenalty(overdueInvoices);
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
  const approvalPenalty = approvalLatencyPenalty(avgTurnaroundHours);
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
  const qcPenalty = qcFailRatePenalty(qcFailRate);
  score -= qcPenalty;
  factors.push({
    signal: "unresolved_issues_qc",
    value: recentQcResults.length > 0 ? `${qcFailCount}/${recentQcResults.length} recent Quality Control checks failed` : "no recent checks",
    penalty: qcPenalty,
    explanation: "Share of recent creative versions whose automatic Quality Control check failed.",
  });

  const lastMeeting = await prisma.meeting.findFirst({
    where: { clientId, occurredAt: { lte: new Date() } },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  const daysSinceLastMeeting = lastMeeting
    ? Math.floor((Date.now() - lastMeeting.occurredAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const meetingPenalty = meetingCadencePenalty(daysSinceLastMeeting);
  score -= meetingPenalty;
  factors.push({
    signal: "meeting_cadence",
    value: daysSinceLastMeeting === null ? "no meeting on record" : `${daysSinceLastMeeting} day(s) since last meeting`,
    penalty: meetingPenalty,
    explanation: "Days since the client's last recorded meeting — a partial proxy for communication gaps.",
  });

  return { score: clampHealthScore(score), factors };
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
