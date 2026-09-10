// API-contract test for POST /api/cedar-brain. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows. Runs in stub mode (no ANTHROPIC_API_KEY in the test
// environment) — this test is about the route's own contract (auth,
// envelope shape, real telemetry persisted), not about live-mode model
// output.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { CEDAR_BRAIN_PROMPT_VERSION, routeToAgents, SYSTEM_PROMPT_TEMPLATE } from "@/lib/cedar-brain";
import { selectModelForRequest } from "@/lib/model-catalog";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.notification.deleteMany();
  await prisma.aiBudget.deleteMany();
  await prisma.cedarBrainRequest.deleteMany();
  await prisma.clientTimelineEvent.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let clientId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Cedar Brain Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "brain-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });
  const client = await prisma.client.create({
    data: { organizationId: org.id, name: "Brain Test Client", companyName: "Inc", services: "[]" },
  });
  clientId = client.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/cedar-brain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cedar-brain", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ prompt: "hello" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the prompt is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  it("returns a stub-mode success envelope and persists real telemetry", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ prompt: "Create a launch campaign" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ mode: "stub", contextSources: [], cedarBrainRequestId: expect.any(String) });

    const stored = await prisma.cedarBrainRequest.findUnique({ where: { id: body.cedarBrainRequestId } });
    expect(stored).toMatchObject({ organizationId: orgId, mode: "stub", success: true, promptVersion: CEDAR_BRAIN_PROMPT_VERSION });
    expect(stored!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records the catalog-selected model (not a hardcoded literal) for a low-complexity prompt", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const prompt = "Hello there, how are you?";
    const expectedModel = selectModelForRequest(routeToAgents(prompt));
    const res = await POST(request({ prompt }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const stored = await prisma.cedarBrainRequest.findUnique({ where: { id: body.cedarBrainRequestId } });
    expect(stored!.modelName).toBe(expectedModel.id);
    expect(expectedModel.tier).toBe("fast");
  });

  it("records the catalog-selected model for a high-complexity, multi-domain prompt", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const prompt =
      "We need a video storyboard, a matching banner design, and a Meta ads campaign with a budget and KPIs.";
    const expectedModel = selectModelForRequest(routeToAgents(prompt));
    const res = await POST(request({ prompt }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const stored = await prisma.cedarBrainRequest.findUnique({ where: { id: body.cedarBrainRequestId } });
    expect(stored!.modelName).toBe(expectedModel.id);
    expect(expectedModel.tier).toBe("premium");
  });

  it("captures a real prompt version snapshot with the actual template text (Section 33 registry)", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    await POST(request({ prompt: "Anything, just to make sure the route ran" }));

    const snapshot = await prisma.cedarPromptSnapshot.findUnique({ where: { promptVersion: CEDAR_BRAIN_PROMPT_VERSION } });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.template).toBe(SYSTEM_PROMPT_TEMPLATE);
  });

  it("returns 403 when scoped to a client the actor cannot read", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org" } });
    const otherClient = await prisma.client.create({
      data: { organizationId: otherOrg.id, name: "Other Client", companyName: "X", services: "[]" },
    });
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ prompt: "Anything", clientId: otherClient.id }));
    expect(res.status).toBe(403);
  });

  it("returns real governed context sources when scoped to a readable client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ prompt: "What should we do next?", clientId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contextSources).toContain("Client record");
  });

  it("returns 402 and never calls the model when the org is over its AI budget", async () => {
    // The budget check only applies when a live call would cost real
    // money — stub it on for this one test via vi.stubEnv, but since
    // the route returns before calling callCedarBrain/fetch when over
    // budget, no real network call happens.
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-key-for-this-test-only");
    try {
      await prisma.aiBudget.create({ data: { organizationId: orgId, monthlyTokenLimit: 100 } });
      await prisma.cedarBrainRequest.create({
        data: {
          organizationId: orgId,
          prompt: "prior usage",
          routedAgents: "[]",
          mode: "live",
          modelName: "claude-sonnet-5",
          promptVersion: "v3",
          latencyMs: 50,
          success: true,
          inputTokens: 100,
          outputTokens: 50,
        },
      });

      getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
      const beforeCount = await prisma.cedarBrainRequest.count({ where: { organizationId: orgId } });
      const res = await POST(request({ prompt: "Anything at all" }));
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.error).toMatch(/budget/i);

      // No new CedarBrainRequest row — the request was blocked before
      // any real work (or even a stub response) happened.
      const afterCount = await prisma.cedarBrainRequest.count({ where: { organizationId: orgId } });
      expect(afterCount).toBe(beforeCount);
    } finally {
      vi.unstubAllEnvs();
      await prisma.notification.deleteMany({ where: { organizationId: orgId } });
      await prisma.aiBudget.deleteMany({ where: { organizationId: orgId } });
      await prisma.cedarBrainRequest.deleteMany({ where: { organizationId: orgId } });
    }
  });
});
