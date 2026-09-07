import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";

const RECENT_TIMELINE_LIMIT = 3;
const RECENT_CEDAR_BRAIN_LIMIT = 3;
const SUMMARY_EXCERPT_LENGTH = 150;
const MAX_CONTEXT_CHARS = 2000; // bounded, per Section 34's "bounded metadata" principle

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export interface GovernedContext {
  text: string;
  sources: string[];
}

export interface CedarBrainActivityItem {
  id: string;
  prompt: string;
  summaryExcerpt: string | null;
  mode: string;
  success: boolean;
  flaggedIncorrect: boolean;
  createdAt: Date;
}

/**
 * Section 6.6's Client Memory ("decisions... client-specific lessons.
 * Explicit or approved workflow writes; versioned") in its simplest
 * honest form: every Cedar Brain request already gets written with a
 * `clientId` when one was selected (see /api/cedar-brain/route.ts) —
 * this is the first place anything reads that history back, closing
 * the gap ADR-007 and ROADMAP.md both flagged ("nothing reads it back
 * yet"). No curation, no outcome measurement, no "lesson learned"
 * judgment — just the real, literal record of what was asked and
 * answered for this client before.
 */
export async function getRecentCedarBrainActivityForClient(
  clientId: string,
  organizationId: string,
  limit: number = RECENT_CEDAR_BRAIN_LIMIT,
): Promise<CedarBrainActivityItem[]> {
  const requests = await prisma.cedarBrainRequest.findMany({
    where: { clientId, organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, prompt: true, response: true, mode: true, success: true, flaggedIncorrect: true, createdAt: true },
  });

  return requests.map((r) => {
    let summaryExcerpt: string | null = null;
    if (r.response) {
      try {
        const parsed = JSON.parse(r.response) as { summary?: string };
        if (parsed.summary) {
          summaryExcerpt =
            parsed.summary.length > SUMMARY_EXCERPT_LENGTH ? `${parsed.summary.slice(0, SUMMARY_EXCERPT_LENGTH)}…` : parsed.summary;
        }
      } catch {
        // Malformed/legacy response JSON — omit rather than guess at content.
      }
    }
    return {
      id: r.id,
      prompt: r.prompt,
      summaryExcerpt,
      mode: r.mode,
      success: r.success,
      flaggedIncorrect: r.flaggedIncorrect,
      createdAt: r.createdAt,
    };
  });
}

/**
 * Section 6.1's Cedar Brain orchestration lifecycle: "Authorize the
 * requested operation before retrieving sensitive context" and "Retrieve
 * only relevant governed context from canonical records and knowledge
 * layers." Command Center previously sent nothing but the raw prompt to
 * the model — this is the first real implementation of that retrieval
 * step, using plain structured queries against canonical tables (Client,
 * BrandProfileVersion, ClientHealthScore, ClientTimelineEvent). No
 * semantic/vector retrieval — ADR-008 defers that until there's
 * unstructured content worth indexing, which this system still doesn't
 * have.
 *
 * Authorization happens BEFORE any data is touched, matching the lifecycle
 * order verbatim: an actor who can't read this client gets AuthError, not
 * a context string that happens to omit sensitive fields.
 */
export async function buildGovernedContext(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
}): Promise<GovernedContext> {
  const allowed = await isAuthorized({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:read",
    clientId: params.clientId,
  });
  if (!allowed) throw new AuthError("You don't have access to this client.");

  const client = await prisma.client.findFirst({
    where: { id: params.clientId, organizationId: params.organizationId },
    include: {
      brandProfile: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
      healthScores: { orderBy: { computedAt: "desc" }, take: 1 },
      timelineEvents: { orderBy: { occurredAt: "desc" }, take: RECENT_TIMELINE_LIMIT },
    },
  });
  if (!client) throw new AuthError("Client not found.");

  const sources: string[] = [];
  const sections: string[] = [`Client: ${client.name} (${client.companyName})`];
  sources.push("Client record");

  const services = parseJSON<string[]>(client.services, []);
  if (services.length > 0) sections.push(`Services: ${services.join(", ")}`);

  const brandVersion = client.brandProfile?.versions[0];
  if (brandVersion) {
    const brandLines: string[] = [`Brand DNA (v${brandVersion.version}):`];
    if (brandVersion.toneOfVoice) brandLines.push(`- Tone of voice: ${brandVersion.toneOfVoice}`);
    if (brandVersion.targetAudience) brandLines.push(`- Target audience: ${brandVersion.targetAudience}`);
    const products = parseJSON<string[]>(brandVersion.products, []);
    if (products.length > 0) brandLines.push(`- Products: ${products.join(", ")}`);
    sections.push(brandLines.join("\n"));
    sources.push(`Brand DNA v${brandVersion.version}`);
  }

  const health = client.healthScores[0];
  if (health) {
    sections.push(`Client Health Score: ${health.score}/100 (decision support, not autonomous truth — Section 4.2).`);
    sources.push(`Client Health Score (${health.score}/100)`);
  }

  if (client.timelineEvents.length > 0) {
    const timelineLines = client.timelineEvents.map((e) => `- ${e.occurredAt.toISOString().slice(0, 10)}: ${e.summary}`);
    sections.push(`Recent activity:\n${timelineLines.join("\n")}`);
    sources.push(`${client.timelineEvents.length} recent timeline event(s)`);
  }

  // Only successful, never-flagged prior answers are worth feeding back
  // as context — a failed request has no real content to reference, and
  // an answer a real reviewer already flagged as wrong (Section 6.3's AI
  // Supervisor) has no business being served back as a trusted precedent
  // for the next request. Both are still shown to a human on the client
  // profile page (including the "flagged" badge), just not injected here.
  const priorActivity = (await getRecentCedarBrainActivityForClient(params.clientId, params.organizationId)).filter(
    (a) => a.success && a.summaryExcerpt && !a.flaggedIncorrect,
  );
  if (priorActivity.length > 0) {
    const priorLines = priorActivity.map((a) => `- Asked: "${a.prompt}" → ${a.summaryExcerpt}`);
    sections.push(`Prior Cedar Brain answers for this client:\n${priorLines.join("\n")}`);
    sources.push(`${priorActivity.length} prior Cedar Brain answer(s)`);
  }

  let text = sections.join("\n\n");
  if (text.length > MAX_CONTEXT_CHARS) text = `${text.slice(0, MAX_CONTEXT_CHARS)}…`;

  return { text, sources };
}
