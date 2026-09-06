import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";

const RECENT_LIMIT = 5;
const PROMPT_EXCERPT_LENGTH = 120;

function excerpt(text: string): string {
  return text.length > PROMPT_EXCERPT_LENGTH ? `${text.slice(0, PROMPT_EXCERPT_LENGTH)}…` : text;
}

export interface RecentFailure {
  id: string;
  promptExcerpt: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface RecentFlagged {
  id: string;
  promptExcerpt: string;
  flaggedAt: Date | null;
  flaggedByName: string | null;
}

export interface AiSupervisorSummary {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  successRatePct: number | null;
  avgLatencyMs: number | null;
  liveCount: number;
  stubCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  flaggedIncorrectCount: number;
  recentFailures: RecentFailure[];
  recentFlagged: RecentFlagged[];
}

/**
 * Section 6.3: "Track agent/model success rate, evaluation score,
 * latency, cost, retries, tool failures, hallucination/error reports,
 * and user corrections." Every number here is a real aggregate over
 * CedarBrainRequest rows written by /api/cedar-brain's real
 * instrumentation (see cedar-brain.ts, docs/specs/ai-supervisor.md) —
 * no evaluation score, retry count, or tool-failure count is included
 * because none of those have a real data source yet in this system
 * (no eval harness, no retry logic, no tool-calling). Token counts
 * stand in for "cost" — they're the real number Anthropic's API
 * returns, rather than a computed dollar figure that would go stale the
 * moment pricing changes.
 */
export async function getAiSupervisorSummary(organizationId: string): Promise<AiSupervisorSummary> {
  const [totalRequests, successCount, liveCount, flaggedIncorrectCount, latencyAgg, tokenAgg, recentFailures, recentFlagged] =
    await Promise.all([
      prisma.cedarBrainRequest.count({ where: { organizationId } }),
      prisma.cedarBrainRequest.count({ where: { organizationId, success: true } }),
      prisma.cedarBrainRequest.count({ where: { organizationId, mode: "live" } }),
      prisma.cedarBrainRequest.count({ where: { organizationId, flaggedIncorrect: true } }),
      prisma.cedarBrainRequest.aggregate({ where: { organizationId }, _avg: { latencyMs: true } }),
      prisma.cedarBrainRequest.aggregate({
        where: { organizationId },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      prisma.cedarBrainRequest.findMany({
        where: { organizationId, success: false },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
        select: { id: true, prompt: true, errorMessage: true, createdAt: true },
      }),
      prisma.cedarBrainRequest.findMany({
        where: { organizationId, flaggedIncorrect: true },
        orderBy: { flaggedAt: "desc" },
        take: RECENT_LIMIT,
        select: { id: true, prompt: true, flaggedAt: true, flaggedByMembership: { select: { user: { select: { name: true } } } } },
      }),
    ]);

  return {
    totalRequests,
    successCount,
    failureCount: totalRequests - successCount,
    successRatePct: totalRequests > 0 ? (successCount / totalRequests) * 100 : null,
    avgLatencyMs: latencyAgg._avg.latencyMs,
    liveCount,
    stubCount: totalRequests - liveCount,
    totalInputTokens: tokenAgg._sum.inputTokens ?? 0,
    totalOutputTokens: tokenAgg._sum.outputTokens ?? 0,
    flaggedIncorrectCount,
    recentFailures: recentFailures.map((r) => ({
      id: r.id,
      promptExcerpt: excerpt(r.prompt),
      errorMessage: r.errorMessage,
      createdAt: r.createdAt,
    })),
    recentFlagged: recentFlagged.map((r) => ({
      id: r.id,
      promptExcerpt: excerpt(r.prompt),
      flaggedAt: r.flaggedAt,
      flaggedByName: r.flaggedByMembership?.user.name ?? null,
    })),
  };
}

/**
 * Section 6.3's "user corrections" signal — a real human marking a real
 * response wrong, not an automated evaluation score (which would need an
 * eval harness this system doesn't have). Any active member of the
 * organization can flag a response; there's no separate permission gate
 * because submitting the original Command Center request has none
 * either (see /api/cedar-brain/route.ts).
 */
export async function flagCedarBrainRequest(params: {
  actorUserId: string;
  organizationId: string;
  requestId: string;
}) {
  const membership = await prisma.membership.findFirst({
    where: { userId: params.actorUserId, organizationId: params.organizationId, status: "ACTIVE" },
  });
  if (!membership) throw new AuthError("Not an active member of this organization.");

  const request = await prisma.cedarBrainRequest.findFirst({
    where: { id: params.requestId, organizationId: params.organizationId },
  });
  if (!request) throw new AuthError("Request not found.");

  return prisma.cedarBrainRequest.update({
    where: { id: request.id },
    data: { flaggedIncorrect: true, flaggedAt: new Date(), flaggedByMembershipId: membership.id },
  });
}
