// Integration test for ai-budget-service.ts (Bible Section 33 — AI
// Budget Governance). See identity.integration.test.ts for why
// next/headers and server-only are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Map<string, string>(),
}));

import { prisma } from "@cedar/db";
import { AuthorizationError } from "@cedar/auth";
import { AuthError } from "./auth-service";
import { alertIfOverBudget, getAiBudgetStatus, setAiBudget } from "./ai-budget-service";

async function wipeDatabase() {
  await prisma.notification.deleteMany();
  await prisma.cedarBrainRequest.deleteMany();
  await prisma.aiBudget.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "AI Budget Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "budget-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "budget-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("getAiBudgetStatus", () => {
  it("returns unrestricted status when no budget row exists — no default is ever fabricated", async () => {
    const status = await getAiBudgetStatus(orgId);
    expect(status.monthlyTokenLimit).toBeNull();
    expect(status.remainingTokens).toBeNull();
    expect(status.overBudget).toBe(false);
  });
});

describe("setAiBudget", () => {
  it("throws AuthorizationError for a member without organization:manage", async () => {
    await expect(
      setAiBudget({ actorUserId: designerUserId, organizationId: orgId, monthlyTokenLimit: 1000 }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects a zero or negative limit with a real validation error", async () => {
    await expect(
      setAiBudget({ actorUserId: ownerUserId, organizationId: orgId, monthlyTokenLimit: 0 }),
    ).rejects.toThrow(AuthError);
    await expect(
      setAiBudget({ actorUserId: ownerUserId, organizationId: orgId, monthlyTokenLimit: -5 }),
    ).rejects.toThrow(AuthError);
  });

  it("sets a real limit, and getAiBudgetStatus computes real usage against it from CedarBrainRequest", async () => {
    await setAiBudget({ actorUserId: ownerUserId, organizationId: orgId, monthlyTokenLimit: 1000 });

    // A live-mode request this month contributes to usage; a stub-mode
    // one does not (it never cost anything real); an old request from
    // last month is outside the current billing period and must not
    // count either.
    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: orgId,
        prompt: "p1",
        routedAgents: "[]",
        mode: "live",
        modelName: "claude-sonnet-5",
        promptVersion: "v3",
        latencyMs: 100,
        success: true,
        inputTokens: 300,
        outputTokens: 200,
      },
    });
    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: orgId,
        prompt: "p2",
        routedAgents: "[]",
        mode: "stub",
        promptVersion: "v3",
        latencyMs: 10,
        success: true,
        inputTokens: null,
        outputTokens: null,
      },
    });
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: orgId,
        prompt: "p3",
        routedAgents: "[]",
        mode: "live",
        modelName: "claude-sonnet-5",
        promptVersion: "v3",
        latencyMs: 100,
        success: true,
        inputTokens: 5000,
        outputTokens: 5000,
        createdAt: lastMonth,
      },
    });

    const status = await getAiBudgetStatus(orgId);
    expect(status.monthlyTokenLimit).toBe(1000);
    expect(status.usedTokensThisMonth).toBe(500);
    expect(status.remainingTokens).toBe(500);
    expect(status.overBudget).toBe(false);
  });

  it("reports overBudget once usage reaches the limit", async () => {
    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: orgId,
        prompt: "p4",
        routedAgents: "[]",
        mode: "live",
        modelName: "claude-sonnet-5",
        promptVersion: "v3",
        latencyMs: 100,
        success: true,
        inputTokens: 300,
        outputTokens: 200,
      },
    });

    const status = await getAiBudgetStatus(orgId);
    expect(status.usedTokensThisMonth).toBe(1000);
    expect(status.overBudget).toBe(true);
    expect(status.remainingTokens).toBe(0);
  });

  it("removes the budget entirely when set to null, returning to unrestricted", async () => {
    await setAiBudget({ actorUserId: ownerUserId, organizationId: orgId, monthlyTokenLimit: null });
    const status = await getAiBudgetStatus(orgId);
    expect(status.monthlyTokenLimit).toBeNull();
    expect(status.overBudget).toBe(false);
  });
});

describe("alertIfOverBudget", () => {
  it("notifies ai:supervise holders once, then deduplicates a second call", async () => {
    await setAiBudget({ actorUserId: ownerUserId, organizationId: orgId, monthlyTokenLimit: 100 });
    await prisma.cedarBrainRequest.create({
      data: {
        organizationId: orgId,
        prompt: "p5",
        routedAgents: "[]",
        mode: "live",
        modelName: "claude-sonnet-5",
        promptVersion: "v3",
        latencyMs: 100,
        success: true,
        inputTokens: 100,
        outputTokens: 100,
      },
    });

    await alertIfOverBudget(orgId);
    const notificationsAfterFirst = await prisma.notification.count({
      where: { organizationId: orgId, category: "ai_budget_exceeded" },
    });
    expect(notificationsAfterFirst).toBe(1);

    // A second call within the dedupe window must not create another.
    await alertIfOverBudget(orgId);
    const notificationsAfterSecond = await prisma.notification.count({
      where: { organizationId: orgId, category: "ai_budget_exceeded" },
    });
    expect(notificationsAfterSecond).toBe(1);

    // Only the OWNER (who has ai:supervise) is notified — the DESIGNER,
    // who has no organization-wide permissions, is not.
    const notification = await prisma.notification.findFirst({ where: { organizationId: orgId, category: "ai_budget_exceeded" } });
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: ownerUserId, organizationId: orgId } });
    expect(notification?.membershipId).toBe(ownerMembership.id);
  });
});
