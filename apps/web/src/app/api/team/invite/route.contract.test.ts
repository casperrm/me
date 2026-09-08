// API-contract test for POST /api/team/invite. See
// apps/web/src/app/api/expenses/route.contract.test.ts for the pattern
// this follows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentActor } = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));
vi.mock("@/lib/current-actor", () => ({ getCurrentActor }));

import { prisma } from "@cedar/db";
import { POST } from "./route";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

let orgId: string;
let ownerUserId: string;
let designerUserId: string;
let gatedOrgId: string;
let gatedUnenrolledAdminUserId: string;
let gatedEnrolledAdminUserId: string;

beforeAll(async () => {
  await wipeDatabase();
  const org = await prisma.organization.create({ data: { name: "Invite Route Test Agency" } });
  orgId = org.id;
  const owner = await prisma.user.create({
    data: { email: "invite-route-owner@test.example", name: "Owner", passwordHash: "irrelevant" },
  });
  ownerUserId = owner.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER", status: "ACTIVE" } });

  const designer = await prisma.user.create({
    data: { email: "invite-route-designer@test.example", name: "Designer", passwordHash: "irrelevant" },
  });
  designerUserId = designer.id;
  await prisma.membership.create({ data: { organizationId: org.id, userId: designer.id, role: "DESIGNER", status: "ACTIVE" } });

  // A second organization with the MFA enforcement policy on — proves
  // requirePermission's MFA gate is a real 403 over HTTP for this route
  // too, not only the /api/expenses one. See docs/specs/mfa.md.
  const gatedOrg = await prisma.organization.create({
    data: { name: "Invite Route Test Agency (MFA-gated)", mfaRequiredForPrivilegedRoles: true },
  });
  gatedOrgId = gatedOrg.id;
  const gatedUnenrolledAdmin = await prisma.user.create({
    data: { email: "invite-route-admin-mfa-gated@test.example", name: "Gated Admin", passwordHash: "irrelevant", mfaEnabled: false },
  });
  gatedUnenrolledAdminUserId = gatedUnenrolledAdmin.id;
  await prisma.membership.create({
    data: { organizationId: gatedOrgId, userId: gatedUnenrolledAdmin.id, role: "ADMIN", status: "ACTIVE" },
  });
  const gatedEnrolledAdmin = await prisma.user.create({
    data: { email: "invite-route-admin-mfa-enrolled@test.example", name: "Enrolled Admin", passwordHash: "irrelevant", mfaEnabled: true },
  });
  gatedEnrolledAdminUserId = gatedEnrolledAdmin.id;
  await prisma.membership.create({
    data: { organizationId: gatedOrgId, userId: gatedEnrolledAdmin.id, role: "ADMIN", status: "ACTIVE" },
  });
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

function request(body: unknown) {
  return new Request("http://localhost/api/team/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/team/invite", () => {
  it("returns 401 when no one is signed in", async () => {
    getCurrentActor.mockResolvedValueOnce(null);
    const res = await POST(request({ email: "new@test.example", role: "DESIGNER" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when email or role is missing", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ email: "new@test.example" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for a member without members:invite", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: designerUserId }, organizationId: orgId });
    const res = await POST(request({ email: "new@test.example", role: "DESIGNER" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
  });

  it("returns 400 with the real service's validation for a CLIENT_PORTAL invite with no client", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ email: "portal-contact@test.example", role: "CLIENT_PORTAL" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/client/i);
  });

  it("returns 200 with a real invite link and persists an Invitation row", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: ownerUserId }, organizationId: orgId });
    const res = await POST(request({ email: "new-real@test.example", role: "DESIGNER" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inviteLink).toMatch(/^\/invite\//);

    const invitation = await prisma.invitation.findFirst({ where: { email: "new-real@test.example" } });
    expect(invitation).toMatchObject({ organizationId: orgId, role: "DESIGNER" });
  });

  it("returns 403 with the MFA-required message for an unenrolled ADMIN when the org's MFA policy is on", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: gatedUnenrolledAdminUserId }, organizationId: gatedOrgId });
    const res = await POST(request({ email: "gated-invite@test.example", role: "DESIGNER" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/MFA enrollment is required/i);
  });

  it("still succeeds for an enrolled ADMIN in the same MFA-gated organization", async () => {
    getCurrentActor.mockResolvedValueOnce({ user: { id: gatedEnrolledAdminUserId }, organizationId: gatedOrgId });
    const res = await POST(request({ email: "gated-invite-enrolled@test.example", role: "DESIGNER" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inviteLink).toMatch(/^\/invite\//);
  });
});
