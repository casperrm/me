import { prisma } from "@cedar/db";

export interface CalendarEvent {
  type: "task_due" | "project_due" | "invoice_due" | "content_due" | "content_publish" | "milestone_due";
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
 * invoice due dates and Content Calendar (Section 9) due/publish dates
 * exist to unify so far — extend this function, not a parallel one, as
 * meetings/shoots/campaign launches land in later phases.
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

  const [tasks, projects, invoices, contentDue, contentPublish, milestones] = await Promise.all([
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
  ];

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
