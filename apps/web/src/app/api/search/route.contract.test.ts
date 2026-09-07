// API-contract test for GET /api/search. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { GET } from "./route";

async function wipeDatabase() {
  await prisma.scopedGrant.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let scopedUserId: string;
let scopedMembershipId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Search Route Test Agency" } });
  orgId = org.id;

  const owner = await prisma.user.create({
    data: { email: "search-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { organizationId: org.id, name: "Volt Mobile Search Target", companyName: "A Inc", services: "[]" } }),
    prisma.client.create({ data: { organizationId: org.id, name: "Unrelated Volt Client", companyName: "B Inc", services: "[]" } }),
  ]);

  // A DESIGNER with no org-wide clients:read, scoped only to clientA —
  // proves the route actually filters search results through
  // getReadableClientIds rather than searching the whole organization
  // for anyone signed in.
  const scoped = await prisma.user.create({
    data: { email: "search-scoped@test.example", name: "Scoped", passwordHash: "irrelevant" },
  });
  scopedUserId = scoped.id;
  const scopedMembership = await prisma.membership.create({
    data: { organizationId: org.id, userId: scoped.id, role: "DESIGNER", status: "ACTIVE" },
  });
  scopedMembershipId = scopedMembership.id;
  await prisma.scopedGrant.create({
    data: { membershipId: scopedMembership.id, permission: "clients:read", clientId: clientA.id },
  });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(q: string) {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

describe("GET /api/search", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await GET(request("volt"));
    expect(res.status).toBe(401);
  });

  it("returns real matching clients for an org-wide reader", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId, membership: { id: "n/a" } });
    const res = await GET(request("volt"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.results.map((r: { title: string }) => r.title);
    expect(names.some((n: string) => n?.includes("Volt Mobile Search Target"))).toBe(true);
    expect(names.some((n: string) => n?.includes("Unrelated Volt Client"))).toBe(true);
  });

  it("scopes results to only the caller's readable clients", async () => {
    getCurrentActor.mockResolvedValueOnce({
      user: { id: scopedUserId },
      organizationId: orgId,
      membership: { id: scopedMembershipId },
    });
    const res = await GET(request("volt"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.results.map((r: { title: string }) => r.title);
    expect(names.some((n: string) => n?.includes("Volt Mobile Search Target"))).toBe(true);
    expect(names.some((n: string) => n?.includes("Unrelated Volt Client"))).toBe(false);
  });
});
