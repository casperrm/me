// AI Budget Governance (Section 33) — see
// docs/specs/ai-budget-governance.md. No default budget is ever
// fabricated: an organization with no AiBudget row has unrestricted
// live Cedar Brain usage, exactly as before this module existed.
import { isAuthorized, requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitNotification, hasRecentNotification } from "@cedar/events";
import { AuthError } from "./auth-service";

export interface AiBudgetStatus {
  monthlyTokenLimit: number | null;
  usedTokensThisMonth: number;
  remainingTokens: number | null;
  overBudget: boolean;
  periodStart: Date;
}

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Real usage computed from CedarBrainRequest rows — the same table AI
 * Supervisor telemetry already writes to (docs/specs/ai-supervisor.md) —
 * summed over the current calendar month, live-mode requests only (stub
 * mode has no real token cost).
 */
export async function getAiBudgetStatus(organizationId: string): Promise<AiBudgetStatus> {
  const periodStart = startOfCurrentMonthUtc();
  const [budget, usageAgg] = await Promise.all([
    prisma.aiBudget.findUnique({ where: { organizationId } }),
    prisma.cedarBrainRequest.aggregate({
      where: { organizationId, mode: "live", createdAt: { gte: periodStart } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  const usedTokensThisMonth = (usageAgg._sum.inputTokens ?? 0) + (usageAgg._sum.outputTokens ?? 0);
  const monthlyTokenLimit = budget?.monthlyTokenLimit ?? null;

  return {
    monthlyTokenLimit,
    usedTokensThisMonth,
    remainingTokens: monthlyTokenLimit === null ? null : Math.max(0, monthlyTokenLimit - usedTokensThisMonth),
    overBudget: monthlyTokenLimit !== null && usedTokensThisMonth >= monthlyTokenLimit,
    periodStart,
  };
}

/**
 * organization:manage-gated — setting a spend limit is an organizational
 * decision, same permission tier as inviting members or revoking
 * connections. `monthlyTokenLimit: null` removes the limit entirely
 * (back to unrestricted), not "set it to zero."
 */
export async function setAiBudget(params: {
  actorUserId: string;
  organizationId: string;
  monthlyTokenLimit: number | null;
}) {
  await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "organization:manage",
  });

  if (params.monthlyTokenLimit === null) {
    await prisma.aiBudget.deleteMany({ where: { organizationId: params.organizationId } });
    return null;
  }

  if (!Number.isFinite(params.monthlyTokenLimit) || params.monthlyTokenLimit <= 0) {
    throw new AuthError("Monthly token limit must be a positive number.");
  }

  return prisma.aiBudget.upsert({
    where: { organizationId: params.organizationId },
    create: { organizationId: params.organizationId, monthlyTokenLimit: params.monthlyTokenLimit },
    update: { monthlyTokenLimit: params.monthlyTokenLimit },
  });
}

// Once per day per organization, not once per blocked request — the same
// "deduplicate noisy alerts" principle apps/worker's escalation job uses
// (Section 30).
const BUDGET_ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000;

/**
 * Notifies every active member who can see AI Supervisor telemetry
 * (ai:supervise) that the organization is over its AI budget — the real
 * "cost-threshold alerting" ai-supervisor.md's scope boundary said
 * didn't exist yet. No-ops if not actually over budget, or if already
 * alerted recently.
 */
export async function alertIfOverBudget(organizationId: string): Promise<void> {
  const status = await getAiBudgetStatus(organizationId);
  if (!status.overBudget || status.monthlyTokenLimit === null) return;

  const alreadyNotified = await hasRecentNotification({
    resourceType: "AiBudget",
    resourceId: organizationId,
    category: "ai_budget_exceeded",
    sinceMs: BUDGET_ALERT_DEDUPE_MS,
  });
  if (alreadyNotified) return;

  const memberships = await prisma.membership.findMany({ where: { organizationId, status: "ACTIVE" } });
  const recipients = await Promise.all(
    memberships.map(async (m) => {
      const allowed = await isAuthorized({ userId: m.userId, organizationId, permission: "ai:supervise" });
      return allowed ? m : null;
    }),
  );

  await Promise.all(
    recipients
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) =>
        emitNotification({
          organizationId,
          membershipId: m.id,
          severity: "WARNING",
          category: "ai_budget_exceeded",
          resourceType: "AiBudget",
          resourceId: organizationId,
          title: "AI budget exceeded for this month",
          body: `Cedar Brain has used ${status.usedTokensThisMonth.toLocaleString()} tokens this month, exceeding the ${status.monthlyTokenLimit!.toLocaleString()}-token budget. Live AI requests are blocked until next month or the budget is raised.`,
          actionUrl: "/command/supervisor",
        }),
      ),
  );
}
