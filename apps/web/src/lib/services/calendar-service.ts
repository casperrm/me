import { prisma } from "@cedar/db";

export interface CalendarEvent {
  type: "task_due" | "project_due" | "invoice_due";
  title: string;
  date: Date;
  clientId: string;
  clientName: string;
  href: string;
}

/**
 * Unifies deadlines across modules into one query (Bible Section 12:
 * "Calendar unifies deadlines, meetings, shoots, campaign launches,
 * approvals, publishing, invoice dates, and renewals"). Only task/
 * project/invoice due dates exist to unify so far — extend this
 * function, not a parallel one, as meetings/shoots/campaign launches
 * land in later phases.
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

  const [tasks, projects, invoices] = await Promise.all([
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
  ]);

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
  ];

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
