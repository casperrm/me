// Integration test for Client Health Score computation (Bible Section
// 4.2), against real Postgres (cedarpoint_test — see vitest.config.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cedar/db";
import { computeHealthScoreForClient, runHealthScoreJob } from "./health-scores";

async function wipeDatabase() {
  await prisma.clientHealthScore.deleteMany();
  await prisma.qualityCheckResult.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.creativeVersion.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.client.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Health Score Test Agency" } });
  orgId = org.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("computeHealthScoreForClient", () => {
  it("scores a clean client (no signals) at 100 with every factor showing zero penalty", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Clean Client", companyName: "Clean Co", services: "[]" },
    });

    const { score, factors } = await computeHealthScoreForClient(client.id);
    expect(score).toBe(100);
    expect(factors.every((f) => f.penalty === 0)).toBe(true);
    expect(factors.map((f) => f.signal).sort()).toEqual(
      [
        "approval_latency",
        "delivery_delays_projects",
        "delivery_delays_tasks",
        "meeting_cadence",
        "payment_status",
        "unresolved_issues_qc",
      ].sort(),
    );
  });

  it("penalizes overdue tasks and overdue projects", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Late Client", companyName: "Late Co", services: "[]" },
    });
    const project = await prisma.project.create({
      data: { clientId: client.id, name: "Overdue Project", dueDate: new Date(Date.now() - 86400000), status: "IN_PROGRESS" },
    });
    await prisma.task.create({
      data: { projectId: project.id, title: "Overdue task 1", dueDate: new Date(Date.now() - 86400000), status: "todo" },
    });
    await prisma.task.create({
      data: { projectId: project.id, title: "Overdue task 2", dueDate: new Date(Date.now() - 86400000), status: "in_progress" },
    });

    const { score, factors } = await computeHealthScoreForClient(client.id);
    const taskFactor = factors.find((f) => f.signal === "delivery_delays_tasks")!;
    const projectFactor = factors.find((f) => f.signal === "delivery_delays_projects")!;
    expect(taskFactor.penalty).toBe(10); // 2 tasks * 5
    expect(projectFactor.penalty).toBe(10); // 1 project * 10
    expect(score).toBe(100 - 10 - 10);
  });

  it("penalizes overdue unpaid invoices heavily", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Unpaid Client", companyName: "Unpaid Co", services: "[]" },
    });
    await prisma.invoice.create({
      data: { clientId: client.id, amountCents: 100000, status: "SENT", dueAt: new Date(Date.now() - 86400000) },
    });

    const { score, factors } = await computeHealthScoreForClient(client.id);
    const invoiceFactor = factors.find((f) => f.signal === "payment_status")!;
    expect(invoiceFactor.penalty).toBe(15);
    expect(score).toBe(85);
  });

  it("does not penalize a paid invoice even if its due date has passed", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Paid Client", companyName: "Paid Co", services: "[]" },
    });
    await prisma.invoice.create({
      data: { clientId: client.id, amountCents: 100000, status: "PAID", dueAt: new Date(Date.now() - 86400000), paidAt: new Date() },
    });

    const { score, factors } = await computeHealthScoreForClient(client.id);
    expect(factors.find((f) => f.signal === "payment_status")!.penalty).toBe(0);
    expect(score).toBe(100);
  });

  it("penalizes recent Quality Control failures as unresolved issues", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "QC Client", companyName: "QC Co", services: "[]" },
    });
    const project = await prisma.project.create({ data: { clientId: client.id, name: "QC Project" } });
    const campaign = await prisma.campaign.create({ data: { projectId: project.id, name: "QC Campaign" } });
    const creative = await prisma.creative.create({ data: { campaignId: campaign.id, type: "image" } });
    const version = await prisma.creativeVersion.create({ data: { creativeId: creative.id, version: 1 } });
    await prisma.qualityCheckResult.create({
      data: { creativeVersionId: version.id, overallStatus: "fail", checks: "[]" },
    });

    const { score, factors } = await computeHealthScoreForClient(client.id);
    const qcFactor = factors.find((f) => f.signal === "unresolved_issues_qc")!;
    expect(qcFactor.penalty).toBe(20); // 1/1 failed * 20
    expect(score).toBe(80);
  });

  it("does not penalize a client with no meeting on record — absence isn't evidence of a gap", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "No Meeting Client", companyName: "No Meeting Co", services: "[]" },
    });

    const { score, factors } = await computeHealthScoreForClient(client.id);
    const meetingFactor = factors.find((f) => f.signal === "meeting_cadence")!;
    expect(meetingFactor.penalty).toBe(0);
    expect(meetingFactor.value).toBe("no meeting on record");
    expect(score).toBe(100);
  });

  it("penalizes a stale meeting cadence but not a recent one, and ignores a future-scheduled meeting", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Stale Meeting Client", companyName: "Stale Meeting Co", services: "[]" },
    });
    await prisma.meeting.create({
      data: {
        organizationId: orgId,
        clientId: client.id,
        title: "Ancient sync",
        occurredAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      },
    });
    // A future-scheduled meeting must never count as "recent" — cadence
    // is about meetings that actually happened, not ones on the books.
    await prisma.meeting.create({
      data: {
        organizationId: orgId,
        clientId: client.id,
        title: "Upcoming sync",
        occurredAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });

    const { score, factors } = await computeHealthScoreForClient(client.id);
    const meetingFactor = factors.find((f) => f.signal === "meeting_cadence")!;
    expect(meetingFactor.penalty).toBe(10); // > 90 days since the real (past) meeting
    expect(score).toBe(90);

    const recentClient = await prisma.client.create({
      data: { organizationId: orgId, name: "Recent Meeting Client", companyName: "Recent Meeting Co", services: "[]" },
    });
    await prisma.meeting.create({
      data: {
        organizationId: orgId,
        clientId: recentClient.id,
        title: "Yesterday's sync",
        occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    const recentResult = await computeHealthScoreForClient(recentClient.id);
    expect(recentResult.factors.find((f) => f.signal === "meeting_cadence")!.penalty).toBe(0);
    expect(recentResult.score).toBe(100);
  });

  it("never lets the score go below 0", async () => {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: "Disaster Client", companyName: "Disaster Co", services: "[]" },
    });
    const project = await prisma.project.create({
      data: { clientId: client.id, name: "Disaster Project", dueDate: new Date(Date.now() - 86400000), status: "IN_PROGRESS" },
    });
    for (let i = 0; i < 10; i++) {
      await prisma.task.create({
        data: { projectId: project.id, title: `Overdue ${i}`, dueDate: new Date(Date.now() - 86400000), status: "todo" },
      });
    }
    for (let i = 0; i < 5; i++) {
      await prisma.invoice.create({
        data: { clientId: client.id, amountCents: 100000, status: "OVERDUE", dueAt: new Date(Date.now() - 86400000) },
      });
    }

    const { score } = await computeHealthScoreForClient(client.id);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("runHealthScoreJob", () => {
  it("creates a new ClientHealthScore row for every client in the database", async () => {
    const clientCount = await prisma.client.count();
    const scoresBefore = await prisma.clientHealthScore.count();

    const computed = await runHealthScoreJob();
    expect(computed).toBe(clientCount);

    const scoresAfter = await prisma.clientHealthScore.count();
    expect(scoresAfter).toBe(scoresBefore + clientCount);
  });

  it("preserves history rather than overwriting the previous score", async () => {
    const client = await prisma.client.findFirstOrThrow();
    const before = await prisma.clientHealthScore.count({ where: { clientId: client.id } });

    await runHealthScoreJob();

    const after = await prisma.clientHealthScore.count({ where: { clientId: client.id } });
    expect(after).toBe(before + 1);
  });
});
