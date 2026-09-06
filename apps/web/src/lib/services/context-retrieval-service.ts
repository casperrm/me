import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { AuthError } from "./auth-service";

const RECENT_TIMELINE_LIMIT = 3;
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

  let text = sections.join("\n\n");
  if (text.length > MAX_CONTEXT_CHARS) text = `${text.slice(0, MAX_CONTEXT_CHARS)}…`;

  return { text, sources };
}
