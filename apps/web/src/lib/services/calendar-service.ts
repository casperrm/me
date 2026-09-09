import { prisma } from "@cedar/db";

export interface CalendarEvent {
  type:
    | "task_due"
    | "project_due"
    | "invoice_due"
    | "content_due"
    | "content_publish"
    | "milestone_due"
    | "shoot_scheduled"
    | "meeting_occurred";
  title: string;
  date: Date;
  clientId: string;
  clientName: string;
  href: string;
  overdue?: boolean;
}

/**
 * Unifies deadlines across modules into one query (Bible Section 12:
 * "Calendar unifies deadlines, meetings, shoots, campaign launches,
 * approvals, publishing, invoice dates, and renewals"). Task/project/
 * invoice due dates, Content Calendar (Section 9) due/publish dates,
 * project milestones, Shoot scheduling (Section 11), and Meeting dates
 * (Section 13) all unify here now — extend this function, not a
 * parallel one, as campaign launches land in a later phase.
 *
 * Shoots and Meetings joined in a follow-up slice, once both modules
 * existed (this function's own prior doc comment named them as pending
 * "once those modules exist" — Shoots had already existed for a while
 * by the time this was written and Meetings shipped the same day). A
 * clientless (internal) Meeting is deliberately excluded — the
 * calendar is inherently client-centric (every other event type here
 * has exactly one client), and there's no client thread for an
 * internal meeting to hang off of; it stays visible on `/meetings`.
 *
 * `clientIds` mirrors `getReadableClientIds`'s contract: `undefined`
 * means "every client in the organization," an array scopes to exactly
 * those clients.
 */
export async function getUpcomingEvents(params: {
  organizationId: string;
  clientIds?: string[];
  from: Date;
  to: Date;
}): Promise<CalendarEvent[]> {
  const clientScope = params.clientIds ? { id: { in: params.clientIds } } : {};

  const [tasks, projects, invoices, contentDue, contentPublish, milestones, shoots, meetings] = await Promise.all([
    prisma.task.findMany({
      where: {
        dueDate: { gte: params.from, lte: params.to },
        project: { client: { organizationId: params.organizationId, ...clientScope } },
      },
      include: { project: { include: { client: true } } },
    }),
    prisma.project.findMany({
      where: {
        dueDate: { gte: params.from, lte: params.to },
        client: { organizationId: params.organizationId, ...clientScope },
      },
      include: { client: true },
    }),
    prisma.invoice.findMany({
      where: {
        dueAt: { gte: params.from, lte: params.to },
        client: { organizationId: params.organizationId, ...clientScope },
      },
      include: { client: true },
    }),
    prisma.contentCalendarItem.findMany({
      where: {
        dueDate: { gte: params.from, lte: params.to },
        client: { organizationId: params.organizationId, ...clientScope },
      },
      include: { client: true },
    }),
    prisma.contentCalendarItem.findMany({
      where: {
        publishAt: { gte: params.from, lte: params.to },
        client: { organizationId: params.organizationId, ...clientScope },
      },
      include: { client: true },
    }),
    prisma.milestone.findMany({
      where: {
        dueDate: { gte: params.from, lte: params.to },
        project: { client: { organizationId: params.organizationId, ...clientScope } },
      },
      include: { project: { include: { client: true } } },
    }),
    prisma.shoot.findMany({
      where: {
        scheduledAt: { gte: params.from, lte: params.to },
        client: { organizationId: params.organizationId, ...clientScope },
      },
      include: { client: true },
    }),
    prisma.meeting.findMany({
      where: {
        clientId: { not: null },
        occurredAt: { gte: params.from, lte: params.to },
        client: { organizationId: params.organizationId, ...clientScope },
      },
      include: { client: true },
    }),
  ]);

  const now = new Date();

  const events: CalendarEvent[] = [
    ...tasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        type: "task_due" as const,
        title: t.title,
        date: t.dueDate as Date,
        clientId: t.project.clientId,
        clientName: t.project.client.name,
        href: `/clients/${t.project.clientId}/projects/${t.projectId}`,
      })),
    ...projects
      .filter((p) => p.dueDate)
      .map((p) => ({
        type: "project_due" as const,
        title: p.name,
        date: p.dueDate as Date,
        clientId: p.clientId,
        clientName: p.client.name,
        href: `/clients/${p.clientId}/projects/${p.id}`,
      })),
    ...invoices
      .filter((i) => i.dueAt)
      .map((i) => ({
        type: "invoice_due" as const,
        title: `Invoice due — $${(i.amountCents / 100).toLocaleString()}`,
        date: i.dueAt as Date,
        clientId: i.clientId,
        clientName: i.client.name,
        href: `/clients/${i.clientId}`,
      })),
    ...contentDue
      .filter((c) => c.dueDate)
      .map((c) => ({
        type: "content_due" as const,
        title: `${c.title} due (${c.channel})`,
        date: c.dueDate as Date,
        clientId: c.clientId,
        clientName: c.client.name,
        href: `/clients/${c.clientId}/content`,
      })),
    ...contentPublish
      .filter((c) => c.publishAt)
      .map((c) => ({
        type: "content_publish" as const,
        title: `${c.title} publishes (${c.channel})`,
        date: c.publishAt as Date,
        clientId: c.clientId,
        clientName: c.client.name,
        href: `/clients/${c.clientId}/content`,
      })),
    ...milestones.map((m) => ({
      type: "milestone_due" as const,
      title: m.name,
      date: m.dueDate,
      clientId: m.project.clientId,
      clientName: m.project.client.name,
      href: `/clients/${m.project.clientId}/projects/${m.projectId}`,
      overdue: !m.done && m.dueDate.getTime() < now.getTime(),
    })),
    ...shoots
      .filter((s) => s.scheduledAt)
      .map((s) => ({
        type: "shoot_scheduled" as const,
        title: s.title,
        date: s.scheduledAt as Date,
        clientId: s.clientId,
        clientName: s.client.name,
        href: `/clients/${s.clientId}/shoots`,
      })),
    ...meetings
      .filter((m) => m.client)
      .map((m) => ({
        type: "meeting_occurred" as const,
        title: m.title,
        date: m.occurredAt,
        clientId: m.clientId as string,
        clientName: m.client!.name,
        href: `/meetings/${m.id}`,
      })),
  ];

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
