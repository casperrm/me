// Paginated access to a client's per-category history (projects,
// invoices, expenses, notes, timeline events, files). The client detail
// page (apps/web/src/app/(app)/clients/[id]/page.tsx) shows only the
// most recent slice of each of these — this service backs the "View
// all" pages that give real access to the rest, instead of the
// previous unbounded findMany that loaded a client's entire history in
// a single request (Phase 7 scale hardening; see
// docs/specs/client-relations-pagination.md).
import { prisma } from "@cedar/db";

export const PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

async function paginate<T>(
  findMany: (args: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
  page: number,
): Promise<Page<T>> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const skip = (safePage - 1) * PAGE_SIZE;
  const [items, totalCount] = await Promise.all([findMany({ skip, take: PAGE_SIZE }), count()]);
  return { items, totalCount, page: safePage, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) };
}

export function getPaginatedProjects(clientId: string, page: number) {
  return paginate(
    (a) =>
      prisma.project.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { campaigns: true, tasks: true } } },
        ...a,
      }),
    () => prisma.project.count({ where: { clientId } }),
    page,
  );
}

export function getPaginatedInvoices(clientId: string, page: number) {
  return paginate(
    (a) => prisma.invoice.findMany({ where: { clientId }, orderBy: { issuedAt: "desc" }, ...a }),
    () => prisma.invoice.count({ where: { clientId } }),
    page,
  );
}

export function getPaginatedExpenses(clientId: string, page: number) {
  return paginate(
    (a) => prisma.expense.findMany({ where: { clientId }, orderBy: { incurredAt: "desc" }, ...a }),
    () => prisma.expense.count({ where: { clientId } }),
    page,
  );
}

export function getPaginatedNotes(clientId: string, page: number) {
  return paginate(
    (a) => prisma.note.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, ...a }),
    () => prisma.note.count({ where: { clientId } }),
    page,
  );
}

export function getPaginatedTimelineEvents(clientId: string, page: number) {
  return paginate(
    (a) => prisma.clientTimelineEvent.findMany({ where: { clientId }, orderBy: { occurredAt: "desc" }, ...a }),
    () => prisma.clientTimelineEvent.count({ where: { clientId } }),
    page,
  );
}

export function getPaginatedAssets(clientId: string, page: number) {
  return paginate(
    (a) =>
      prisma.asset.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { include: { user: true } } },
        ...a,
      }),
    () => prisma.asset.count({ where: { clientId } }),
    page,
  );
}
