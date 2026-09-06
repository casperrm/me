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

  const expense = await prisma.expense.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
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
