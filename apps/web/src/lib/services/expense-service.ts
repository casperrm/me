import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

/**
 * `clientId` is optional — a general overhead cost (software, a
 * non-client-specific contractor) has none, and `getClientProfitability`
 * reports those separately rather than guessing which client to charge
 * them to. `finance:write` is the same permission the CEO Dashboard's
 * finance:read pairs with — expenses are financial records, not a
 * per-client write like `clients:write`.
 */
export async function createExpense(params: {
  actorUserId: string;
  organizationId: string;
  category: string;
  amountCents: number;
  description?: string;
  clientId?: string;
  projectId?: string;
  campaignId?: string;
  incurredAt?: Date;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "finance:write",
  });

  if (!params.category.trim()) throw new AuthError("Category is required.");
  if (!Number.isFinite(params.amountCents) || params.amountCents <= 0) {
    throw new AuthError("Amount must be a positive number.");
  }

  if (params.clientId) {
    const client = await prisma.client.findFirst({ where: { id: params.clientId, organizationId: params.organizationId } });
    if (!client) throw new AuthError("Client not found.");
  }

  // A project-tagged expense with no client doesn't make sense (a
  // project always belongs to exactly one client) — and the project
  // must actually belong to the given client, not just exist somewhere
  // in the organization.
  if (params.projectId) {
    if (!params.clientId) throw new AuthError("A project can only be set alongside its client.");
    const project = await prisma.project.findFirst({ where: { id: params.projectId, clientId: params.clientId } });
    if (!project) throw new AuthError("Project not found for this client.");
  }

  // A campaign-tagged expense with no project doesn't make sense (a
  // campaign always belongs to exactly one project) — and the campaign
  // must actually belong to the given project, not just exist somewhere
  // in the organization. Mirrors the project-belongs-to-client check
  // above, one level down.
  if (params.campaignId) {
    if (!params.projectId) throw new AuthError("A campaign can only be set alongside its project.");
    const campaign = await prisma.campaign.findFirst({ where: { id: params.campaignId, projectId: params.projectId } });
    if (!campaign) throw new AuthError("Campaign not found for this project.");
  }

  const expense = await prisma.expense.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      projectId: params.projectId,
      campaignId: params.campaignId,
      category: params.category.trim(),
      amountCents: params.amountCents,
      description: params.description || undefined,
      incurredAt: params.incurredAt,
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "expense.created",
    resourceType: "Expense",
    resourceId: expense.id,
    clientId: params.clientId,
    result: "SUCCESS",
    changeSet: { category: expense.category, amountCents: expense.amountCents },
  });

  return expense;
}
