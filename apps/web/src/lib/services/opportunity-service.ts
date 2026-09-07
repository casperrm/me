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
  const [client, otherClients, ownFormats, peerFormatCounts] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { services: true } }),
    // Bounded by organization-wide client count (the Bible's own scale
    // target is 500 clients), not by creative/content history — unlike
    // the creative-format queries below, this doesn't grow without
    // bound over a client's lifetime, so it's left as a plain scan
    // rather than pushed into raw SQL (see docs/specs/opportunity-engine-scaling.md).
    prisma.client.findMany({ where: { organizationId, id: { not: clientId } }, select: { services: true } }),
    // Distinct types only — this client's own creative *history* can be
    // arbitrarily long, but the set of distinct format types it uses is
    // small and bounded regardless.
    prisma.creative.findMany({
      where: { campaign: { project: { clientId } } },
      select: { type: true },
      distinct: ["type"],
    }),
    // The previous version fetched every creative row for every other
    // client in the organization just to count distinct peer clients
    // per format — a full-organization creative-history scan on every
    // client detail page load. This computes the same per-format peer
    // counts directly in Postgres via GROUP BY, returning only one row
    // per distinct format value that exists among peers (Phase 7 scale
    // hardening; see docs/specs/opportunity-engine-scaling.md).
    prisma.$queryRaw<{ type: string; peerCount: bigint }[]>`
      SELECT cr.type AS type, COUNT(DISTINCT p."clientId")::bigint AS "peerCount"
      FROM creatives cr
      JOIN campaigns cam ON cam.id = cr."campaignId"
      JOIN projects p ON p.id = cam."projectId"
      JOIN clients c ON c.id = p."clientId"
      WHERE c."organizationId" = ${organizationId} AND c.id != ${clientId}
      GROUP BY cr.type
    `,
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
  // "how many peers" semantic as the service gap above. peerFormatCounts
  // already IS that count, computed in Postgres.
  const ownFormatSet = new Set(ownFormats.map((c) => c.type));
  for (const row of peerFormatCounts) {
    const peerCount = Number(row.peerCount);
    if (ownFormatSet.has(row.type) || peerCount < MIN_PEER_COUNT) continue;
    opportunities.push({
      type: "creative_format_gap",
      label: row.type,
      evidence: `${peerCount} other client${peerCount === 1 ? "" : "s"} have "${row.type}" creative work; none for this client yet.`,
      peerCount,
    });
  }

  return opportunities.sort((a, b) => b.peerCount - a.peerCount);
}
