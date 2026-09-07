// API-contract test for POST /api/eval/run. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { ROUTING_GOLDEN_SET } from "@/lib/services/eval-service";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.aiEvalResult.deleteMany();
  await prisma.aiEvalRun.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Eval Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "eval-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "eval-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("POST /api/eval/run", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a member without ai:supervise", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns 200 with a real persisted run for an owner", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, totalCases: ROUTING_GOLDEN_SET.length });

    const run = await prisma.aiEvalRun.findUnique({ where: { id: body.runId }, include: { results: true } });
    expect(run).not.toBeNull();
    expect(run!.results).toHaveLength(ROUTING_GOLDEN_SET.length);
  });
});
