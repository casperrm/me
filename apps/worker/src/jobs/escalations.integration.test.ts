// Integration test for the overdue-escalation worker job (Bible Section
// 30) — apps/worker's first-ever job (see the module's own doc comment
// in escalations.ts), which had no test coverage at all until this
// slice. Real Postgres (cedarpoint_test — see vitest.config.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@cedar/db";
import { runEscalationScan } from "./escalations";

// Wraps the real notifyClientWriters (not a stub) so most tests exercise
// the genuine notification path. `failCategory.value` (mutable, boxed so
// the vi.mock factory below — which Vitest hoists above this file's own
// top-level statements — can close over it safely) lets exactly one test
// simulate a failure confined to a single escalation category, to prove
// the other categories aren't silently skipped by it.
const { failCategory } = vi.hoisted(() => ({ failCategory: { value: null as string | null } }));
vi.mock("@cedar/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cedar/events")>();
  return {
    ...actual,
    notifyClientWriters: vi.fn(async (params: Parameters<typeof actual.notifyClientWriters>[0]) => {
      if (failCategory.value && params.category === failCategory.value) {
        throw new Error(`simulated notify failure for ${params.category} only`);
      }
      return actual.notifyClientWriters(params);
    }),
  };
});

async function wipeDatabase() {
  await prisma.workflowRun.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.contentCalendarItem.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerMembershipId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();

  const org = await prisma.organization.create({ data: { name: "Escalation Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "escalation-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  const ownerMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
  });
  ownerMembershipId = ownerMembership.id;

  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Escalation Client", companyName: "Escalation Co", services: "[]" },
  });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

afterEach(() => {
  failCategory.value = null;
});

describe("runEscalationScan", () => {
  it("escalates one overdue task, project, content item, and invoice, each exactly once", async () => {
    const project = await prisma.project.create({
      data: { clientId, name: "Overdue Project", dueDate: new Date(Date.now() - 86400000), status: "IN_PROGRESS" },
    });
    const task = await prisma.task.create({
      data: { projectId: project.id, title: "Overdue Task", dueDate: new Date(Date.now() - 86400000), status: "todo" },
    });
    const content = await prisma.contentCalendarItem.create({
      data: { clientId, title: "Overdue Content", channel: "instagram", dueDate: new Date(Date.now() - 86400000), status: "DRAFT" },
    });
    const invoice = await prisma.invoice.create({
      data: { clientId, amountCents: 250000, status: "SENT", dueAt: new Date(Date.now() - 86400000) },
    });

    const total = await runEscalationScan();
    expect(total).toBe(4);

    const notifications = await prisma.notification.findMany({ where: { membershipId: ownerMembershipId } });
    const byCategory = new Map(notifications.map((n) => [n.category, n]));

    expect(byCategory.get("task_overdue")).toMatchObject({ resourceId: task.id, severity: "WARNING" });
    expect(byCategory.get("project_overdue")).toMatchObject({ resourceId: project.id, severity: "WARNING" });
    expect(byCategory.get("content_overdue")).toMatchObject({ resourceId: content.id, severity: "WARNING" });
    const invoiceNotification = byCategory.get("invoice_overdue")!;
    expect(invoiceNotification.resourceId).toBe(invoice.id);
    expect(invoiceNotification.severity).toBe("CRITICAL");
    expect(invoiceNotification.title).toContain("$2,500");

    // Re-running immediately must not double-notify — the 24h dedupe
    // window (Section 30: "Deduplicate noisy alerts") applies equally
    // to the new invoice trigger as to the three pre-existing ones.
    const secondRun = await runEscalationScan();
    expect(secondRun).toBe(0);
    const notificationsAfterRerun = await prisma.notification.count({ where: { membershipId: ownerMembershipId } });
    expect(notificationsAfterRerun).toBe(4);

    // Section 18.2: this run is now durably recorded, not just logged —
    // packages/automation's runWorkflow() persists a real WorkflowRun row.
    const runs = await prisma.workflowRun.findMany({ where: { workflowKey: "escalation-scan" }, orderBy: { startedAt: "asc" } });
    expect(runs).toHaveLength(2); // the two runEscalationScan() calls above
    expect(runs[0].status).toBe("completed");
    const steps = JSON.parse(runs[0].steps);
    expect(steps.map((s: { name: string }) => s.name)).toEqual([
      "escalate-overdue-tasks",
      "escalate-overdue-projects",
      "escalate-overdue-content",
      "escalate-overdue-invoices",
    ]);
    expect(steps.every((s: { status: string }) => s.status === "success")).toBe(true);
    expect(steps.find((s: { name: string }) => s.name === "escalate-overdue-invoices").output).toEqual({ escalated: 1 });
  });

  it("isolates a failing category instead of a bare Promise.all silently skipping the others — the real bug this migration fixed", async () => {
    const project = await prisma.project.create({
      data: { clientId, name: "Isolation Project", dueDate: new Date(Date.now() - 86400000), status: "IN_PROGRESS" },
    });
    const task = await prisma.task.create({
      data: { projectId: project.id, title: "Isolation Task", dueDate: new Date(Date.now() - 86400000), status: "todo" },
    });

    // Simulate a real failure confined to exactly one category (invoices)
    // — before this migration, this would have made Promise.all reject
    // immediately, so the task escalation above would never have run.
    failCategory.value = "invoice_overdue";
    // Give the invoice category something to actually attempt and fail on.
    const invoice = await prisma.invoice.create({
      data: { clientId, amountCents: 50000, status: "SENT", dueAt: new Date(Date.now() - 86400000) },
    });

    // A partial failure (1 of 4 categories) doesn't fail the whole job —
    // runEscalationScan only rethrows when every category failed (see its
    // own doc comment). It still returns the count from the categories
    // that succeeded.
    const total = await runEscalationScan();
    expect(total).toBe(2); // task + project escalated; content had nothing overdue; invoice failed

    // The task category ran and succeeded despite the invoice category
    // throwing — proving real step isolation, not just re-logging.
    const taskNotification = await prisma.notification.findFirst({ where: { resourceId: task.id, category: "task_overdue" } });
    expect(taskNotification).not.toBeNull();

    const run = await prisma.workflowRun.findFirstOrThrow({ where: { workflowKey: "escalation-scan" }, orderBy: { startedAt: "desc" } });
    expect(run.status).toBe("completed_with_errors");
    const steps: { name: string; status: string; error?: string }[] = JSON.parse(run.steps);
    const invoiceStep = steps.find((s) => s.name === "escalate-overdue-invoices")!;
    expect(invoiceStep.status).toBe("failed");
    expect(invoiceStep.error).toContain("simulated notify failure for invoice_overdue only");
    expect(steps.filter((s) => s.status === "success")).toHaveLength(3);

    // The failed notify attempt left no Notification row (it threw before
    // one could be written), so this invoice would be picked up by every
    // future scan forever — clean it up so later tests in this file
    // aren't polluted by an invoice that never successfully escalated.
    await prisma.invoice.delete({ where: { id: invoice.id } });
  });

  it("never escalates a paid invoice even if its due date has passed", async () => {
    await prisma.invoice.create({
      data: { clientId, amountCents: 100000, status: "PAID", dueAt: new Date(Date.now() - 86400000), paidAt: new Date() },
    });

    const total = await runEscalationScan();
    expect(total).toBe(0);
  });

  it("never escalates an invoice that isn't due yet", async () => {
    await prisma.invoice.create({
      data: { clientId, amountCents: 100000, status: "SENT", dueAt: new Date(Date.now() + 7 * 86400000) },
    });

    const total = await runEscalationScan();
    expect(total).toBe(0);
  });
});
