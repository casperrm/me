import { prisma } from "@cedar/db";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export interface Opportunity {
  type: "service_gap" | "creative_format_gap";
  label: string;
  evidence: string;
  peerCount: number;
}

// Only surface a gap when at least this many *other* clients already
// have it — one other client having something isn't evidence of a
// pattern, it's a coincidence.
const MIN_PEER_COUNT = 2;

/**
 * Section 4.2: "Opportunity Engine identifies evidence-backed cross-sell/
 * upsell opportunities and explains the supporting data." Every
 * opportunity here is a literal count of other real clients/creative
 * work in this organization — never a prediction, trend extrapolation,
 * or anything requiring judgment a model would have to supply. Like
 * Client Health Score, this is decision support, not autonomous truth:
 * a real account manager still decides whether a gap is actually worth
 * raising with this specific client.
 *
 * Scope boundary — see docs/specs/opportunity-engine.md: only two signal
 * types are built, both because they're the only ones with a real,
 * already-collected "what do our other clients have that this one
 * doesn't" comparison available. Anything requiring trend data, intent
 * signals, or external market data is explicitly not built.
 */
export async function getOpportunitiesForClient(clientId: string, organizationId: string): Promise<Opportunity[]> {
  const [client, otherClients, ownCreatives, otherCreatives] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { services: true } }),
    prisma.client.findMany({ where: { organizationId, id: { not: clientId } }, select: { services: true } }),
    prisma.creative.findMany({
      where: { campaign: { project: { clientId } } },
      select: { type: true },
    }),
    prisma.creative.findMany({
      where: { campaign: { project: { client: { organizationId, id: { not: clientId } } } } },
      select: { type: true, campaign: { select: { project: { select: { clientId: true } } } } },
    }),
  ]);

  const opportunities: Opportunity[] = [];

  // Service gap: what do peer clients have that this one doesn't.
  const ownServices = new Set(parseJSON<string[]>(client.services, []));
  const serviceCounts = new Map<string, number>();
  for (const peer of otherClients) {
    const peerServices = new Set(parseJSON<string[]>(peer.services, []));
    for (const service of peerServices) {
      serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
    }
  }
  for (const [service, count] of serviceCounts) {
    if (ownServices.has(service) || count < MIN_PEER_COUNT) continue;
    opportunities.push({
      type: "service_gap",
      label: service,
      evidence: `${count} other client${count === 1 ? "" : "s"} in your organization use this service.`,
      peerCount: count,
    });
  }

  // Creative format gap: which production formats have other clients
  // used that this one hasn't — counted by distinct client, same
  // "how many peers" semantic as the service gap above.
  const ownFormats = new Set(ownCreatives.map((c) => c.type));
  const formatToClients = new Map<string, Set<string>>();
  for (const creative of otherCreatives) {
    const peerClientId = creative.campaign.project.clientId;
    if (!formatToClients.has(creative.type)) formatToClients.set(creative.type, new Set());
    formatToClients.get(creative.type)!.add(peerClientId);
  }
  for (const [format, clientIds] of formatToClients) {
    if (ownFormats.has(format) || clientIds.size < MIN_PEER_COUNT) continue;
    opportunities.push({
      type: "creative_format_gap",
      label: format,
      evidence: `${clientIds.size} other client${clientIds.size === 1 ? "" : "s"} have "${format}" creative work; none for this client yet.`,
      peerCount: clientIds.size,
    });
  }

  return opportunities.sort((a, b) => b.peerCount - a.peerCount);
}
