// Integration test for the overdue-escalation worker job (Bible Section
// 30) — apps/worker's first-ever job (see the module's own doc comment
// in escalations.ts), which had no test coverage at all until this
// slice. Real Postgres (cedarpoint_test — see vitest.config.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { runEscalationScan } from "./escalations";

async function wipeDatabase() {
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
