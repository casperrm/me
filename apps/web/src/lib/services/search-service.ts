import { prisma } from "@cedar/db";

export interface SearchResult {
  type: "client" | "project" | "campaign" | "creative" | "content" | "shoot" | "task" | "meeting";
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

const RESULTS_PER_TYPE = 5;

/**
 * Section 28.2: "Global search/command palette can find records and
 * initiate permitted actions." This covers the "find records" half —
 * see docs/specs/search.md for why "initiate permitted actions" (running
 * a command, not just navigating to a result) is explicitly out of scope
 * here and belongs with Cedar Command Center instead.
 *
 * `clientIds` mirrors `getReadableClientIds`'s contract: `undefined`
 * means "every client in the organization," an array scopes to exactly
 * those clients — every query below filters through it, so a scoped
 * collaborator's search results can never leak a client they can't read
 * (Bible Section 38).
 */
export async function searchRecords(params: {
  organizationId: string;
  clientIds?: string[];
  query: string;
}): Promise<SearchResult[]> {
  const q = params.query.trim();
  if (q.length < 2) return [];

  const clientScope = params.clientIds ? { id: { in: params.clientIds } } : {};
  const contains = { contains: q, mode: "insensitive" as const };

  const [clients, projects, campaigns, creatives, contentItems, shoots, tasks, meetings] = await Promise.all([
    prisma.client.findMany({
      where: { organizationId: params.organizationId, ...clientScope, OR: [{ name: contains }, { companyName: contains }] },
      take: RESULTS_PER_TYPE,
    }),
    prisma.project.findMany({
      where: { client: { organizationId: params.organizationId, ...clientScope }, name: contains },
      include: { client: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.campaign.findMany({
      where: { project: { client: { organizationId: params.organizationId, ...clientScope } }, name: contains },
      include: { project: { include: { client: true } } },
      take: RESULTS_PER_TYPE,
    }),
    prisma.creative.findMany({
      where: {
        campaign: { project: { client: { organizationId: params.organizationId, ...clientScope } } },
        OR: [{ type: contains }, { platform: contains }],
      },
      include: { campaign: { include: { project: { include: { client: true } } } } },
      take: RESULTS_PER_TYPE,
    }),
    prisma.contentCalendarItem.findMany({
      where: { client: { organizationId: params.organizationId, ...clientScope }, title: contains },
      include: { client: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.shoot.findMany({
      where: { client: { organizationId: params.organizationId, ...clientScope }, title: contains },
      include: { client: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.task.findMany({
      where: { project: { client: { organizationId: params.organizationId, ...clientScope } }, title: contains },
      include: { project: { include: { client: true } } },
      take: RESULTS_PER_TYPE,
    }),
    // Meeting carries organizationId directly (not reached via a client
    // relation, since an internal meeting has no client at all — see
    // docs/specs/meetings.md). A scoped reader (params.clientIds is a
    // specific array) only matches meetings tied to one of their
    // readable clients; an internal/clientless meeting is never part of
    // a scoped grant, so it's excluded exactly like
    // listMeetingsForOrganization already excludes it for the same
    // reader. An org-wide reader (params.clientIds undefined) matches
    // every meeting, internal ones included.
    prisma.meeting.findMany({
      where: {
        organizationId: params.organizationId,
        ...(params.clientIds ? { clientId: { in: params.clientIds } } : {}),
        title: contains,
      },
      include: { client: true },
      take: RESULTS_PER_TYPE,
    }),
  ]);

  const results: SearchResult[] = [
    ...clients.map((c) => ({ type: "client" as const, id: c.id, title: c.name, subtitle: c.companyName, url: `/clients/${c.id}` })),
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      title: p.name,
      subtitle: p.client.name,
      url: `/clients/${p.clientId}/projects/${p.id}`,
    })),
    ...campaigns.map((c) => ({
      type: "campaign" as const,
      id: c.id,
      title: c.name,
      subtitle: c.project.client.name,
      url: `/clients/${c.project.clientId}/projects/${c.projectId}/campaigns/${c.id}`,
    })),
    ...creatives.map((c) => ({
      type: "creative" as const,
      id: c.id,
      title: `${c.type}${c.platform ? ` — ${c.platform}` : ""}`,
      subtitle: c.campaign.project.client.name,
      url: `/clients/${c.campaign.project.clientId}/projects/${c.campaign.projectId}/campaigns/${c.campaignId}/creatives/${c.id}`,
    })),
    ...contentItems.map((c) => ({
      type: "content" as const,
      id: c.id,
      title: c.title,
      subtitle: c.client.name,
      url: `/clients/${c.clientId}/content`,
    })),
    ...shoots.map((s) => ({
      type: "shoot" as const,
      id: s.id,
      title: s.title,
      subtitle: s.client.name,
      url: `/clients/${s.clientId}/shoots`,
    })),
    ...tasks.map((t) => ({
      type: "task" as const,
      id: t.id,
      title: t.title,
      subtitle: `${t.project.name} — ${t.project.client.name}`,
      url: `/clients/${t.project.clientId}/projects/${t.projectId}`,
    })),
    ...meetings.map((m) => ({
      type: "meeting" as const,
      id: m.id,
      title: m.title,
      subtitle: m.client ? m.client.name : "Internal meeting",
      url: `/meetings/${m.id}`,
    })),
  ];

  return results;
}
