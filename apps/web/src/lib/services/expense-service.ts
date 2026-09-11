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

async function assertExpenseInOrg(expenseId: string, organizationId: string) {
  const expense = await prisma.expense.findFirst({ where: { id: expenseId, organizationId } });
  if (!expense) throw new AuthError("Expense not found.");
  return expense;
}

/**
 * The missing write half of `createExpense` — once logged, a
 * fat-fingered amount/category/date was previously permanent, and that
 * number feeds directly into `getClientProfitability`/
 * `getProjectProfitability`/`getCampaignProfitability` and the CEO
 * Dashboard's cost aggregate. Same org-wide `finance:write` tier
 * `createExpense` already uses (an expense's `clientId` is optional, so
 * this can't be scoped to a single client the way `updateClient` is).
 *
 * Deliberately does NOT allow reassigning `clientId`/`projectId`/
 * `campaignId` — re-attributing an expense to a different client/
 * project/campaign would require re-running `createExpense`'s whole
 * hierarchical validation chain (a campaign requires its project, which
 * requires its client) and raises its own questions about whether
 * historical profitability reports should be retroactively affected.
 * This slice fixes "a typo is permanent," not "expenses can be moved
 * between books" — a real but separate, larger feature.
 */
export async function updateExpense(params: {
  actorUserId: string;
  organizationId: string;
  expenseId: string;
  category?: string;
  amountCents?: number;
  description?: string;
  incurredAt?: Date;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "finance:write",
  });

  const expense = await assertExpenseInOrg(params.expenseId, params.organizationId);

  const data: { category?: string; amountCents?: number; description?: string | null; incurredAt?: Date } = {};

  if (params.category !== undefined) {
    const category = params.category.trim();
    if (!category) throw new AuthError("Category is required.");
    data.category = category;
  }
  if (params.amountCents !== undefined) {
    if (!Number.isFinite(params.amountCents) || params.amountCents <= 0) {
      throw new AuthError("Amount must be a positive number.");
    }
    data.amountCents = params.amountCents;
  }
  if (params.description !== undefined) data.description = params.description.trim() || null;
  if (params.incurredAt !== undefined) data.incurredAt = params.incurredAt;

  if (Object.keys(data).length === 0) throw new AuthError("No changes provided.");

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    const previousValue = expense[key];
    const newValue = data[key];
    const prevComparable = previousValue instanceof Date ? previousValue.toISOString() : previousValue;
    const newComparable = newValue instanceof Date ? newValue.toISOString() : newValue;
    if (prevComparable !== newComparable) {
      before[key] = prevComparable;
      after[key] = newComparable;
    }
  }

  const updated = await prisma.expense.update({ where: { id: expense.id }, data });

  if (Object.keys(after).length > 0) {
    await emitAuditEvent({
      organizationId: params.organizationId,
      actorType: "USER",
      actorId: membership.id,
      action: "expense.updated",
      resourceType: "Expense",
      resourceId: expense.id,
      clientId: expense.clientId ?? undefined,
      result: "SUCCESS",
      changeSet: { before, after },
    });
  }

  return updated;
}

/**
 * Expense has no `onDelete: Cascade` dependents (unlike, say,
 * `ProjectTemplate`/`ProjectTemplateTask`), so a plain delete is safe.
 * The audit event captures a full snapshot of what's being removed —
 * after this call, the row itself is gone, so the audit trail is the
 * only remaining record of what the expense was (Section 23.2's
 * append-only audit log doing exactly the job it's meant for).
 */
export async function deleteExpense(params: { actorUserId: string; organizationId: string; expenseId: string }) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "finance:write",
  });

  const expense = await assertExpenseInOrg(params.expenseId, params.organizationId);

  await prisma.expense.delete({ where: { id: expense.id } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "expense.deleted",
    resourceType: "Expense",
    resourceId: expense.id,
    clientId: expense.clientId ?? undefined,
    result: "SUCCESS",
    changeSet: {
      category: expense.category,
      amountCents: expense.amountCents,
      description: expense.description,
      incurredAt: expense.incurredAt.toISOString(),
    },
  });

  return { id: expense.id };
}
