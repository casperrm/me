import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

// A project belongs to exactly one client — tagging an invoice to a
// project that isn't actually this client's own would silently corrupt
// project-level profitability (Section 4.2/16), so this is checked
// against the client, not just the organization.
async function assertProjectBelongsToClient(projectId: string, clientId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!project) throw new AuthError("Project not found for this client.");
}

/**
 * Invoices previously only ever came from the seed script — this is the
 * first real write path (mirrors expense-service.ts's createExpense,
 * which was the first real write path for Expense). Gated on
 * `finance:write` since recording a billing document is a financial
 * record write, not a per-client write like `clients:write`.
 */
export async function createInvoice(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  projectId?: string;
  amountCents: number;
  dueAt?: Date;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "finance:write",
  });
  await assertClientInOrg(params.clientId, params.organizationId);
  if (params.projectId) await assertProjectBelongsToClient(params.projectId, params.clientId);

  if (!Number.isFinite(params.amountCents) || params.amountCents <= 0) {
    throw new AuthError("Amount must be a positive number.");
  }

  const invoice = await prisma.invoice.create({
    data: {
      clientId: params.clientId,
      projectId: params.projectId,
      amountCents: params.amountCents,
      dueAt: params.dueAt,
      status: "DRAFT",
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "invoice.created",
    resourceType: "Invoice",
    resourceId: invoice.id,
    clientId: params.clientId,
    result: "SUCCESS",
    changeSet: { amountCents: invoice.amountCents },
  });

  await prisma.clientTimelineEvent.create({
    data: { clientId: params.clientId, type: "invoice_created", summary: `Invoice for ${money(invoice.amountCents)} created (draft).` },
  });

  return invoice;
}

async function loadInvoiceInOrg(invoiceId: string, organizationId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, client: { organizationId } },
    include: { client: true },
  });
  if (!invoice) throw new AuthError("Invoice not found.");
  return invoice;
}

export async function sendInvoice(params: { actorUserId: string; organizationId: string; invoiceId: string }) {
  const invoice = await loadInvoiceInOrg(params.invoiceId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "finance:write",
  });

  if (invoice.status !== "DRAFT") throw new AuthError("Only a draft invoice can be sent.");

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "invoice.sent",
    resourceType: "Invoice",
    resourceId: invoice.id,
    clientId: invoice.clientId,
    result: "SUCCESS",
    changeSet: { before: { status: invoice.status }, after: { status: "SENT" } },
  });

  await prisma.clientTimelineEvent.create({
    data: { clientId: invoice.clientId, type: "invoice_sent", summary: `Invoice for ${money(invoice.amountCents)} sent.` },
  });

  return updated;
}

export async function markInvoicePaid(params: { actorUserId: string; organizationId: string; invoiceId: string }) {
  const invoice = await loadInvoiceInOrg(params.invoiceId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "finance:write",
  });

  if (invoice.status !== "SENT") throw new AuthError("Only a sent invoice can be marked paid.");

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: new Date() } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "invoice.paid",
    resourceType: "Invoice",
    resourceId: invoice.id,
    clientId: invoice.clientId,
    result: "SUCCESS",
    changeSet: { before: { status: invoice.status }, after: { status: "PAID" } },
  });

  await prisma.clientTimelineEvent.create({
    data: { clientId: invoice.clientId, type: "invoice_paid", summary: `Invoice for ${money(invoice.amountCents)} paid.` },
  });

  return updated;
}
