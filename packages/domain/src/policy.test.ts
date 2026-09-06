import { describe, expect, it } from "vitest";
import { can, canManageMembership, type Grant } from "./policy";

const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

describe("can() — role defaults", () => {
  it("OWNER can do anything, including permissions not in the catalog's global map", () => {
    expect(
      can({ actor: { membershipId: "m1", role: "OWNER", status: "ACTIVE" }, grants: [], permission: "finance:write" }),
    ).toBe(true);
  });

  it("ADMIN has organization-wide access without needing explicit grants", () => {
    expect(
      can({ actor: { membershipId: "m1", role: "ADMIN", status: "ACTIVE" }, grants: [], permission: "clients:read", clientId: CLIENT_A }),
    ).toBe(true);
    expect(
      can({ actor: { membershipId: "m1", role: "ADMIN", status: "ACTIVE" }, grants: [], permission: "finance:read" }),
    ).toBe(true);
  });

  it("a revoked/invited membership can never authorize, even OWNER", () => {
    expect(
      can({ actor: { membershipId: "m1", role: "OWNER", status: "REVOKED" }, grants: [], permission: "clients:read" }),
    ).toBe(false);
    expect(
      can({ actor: { membershipId: "m1", role: "ADMIN", status: "INVITED" }, grants: [], permission: "clients:read" }),
    ).toBe(false);
  });
});

describe("can() — Section 38 scenario: scoped collaborator cannot access unauthorized clients or finance", () => {
  const grants: Grant[] = [{ permission: "clients:read", clientId: CLIENT_A }];
  const actor = { membershipId: "m2", role: "ACCOUNT_MANAGER" as const, status: "ACTIVE" as const };

  it("can read the client they're scoped to", () => {
    expect(can({ actor, grants, permission: "clients:read", clientId: CLIENT_A })).toBe(true);
  });

  it("cannot read a different client, even with an active membership and a real permission", () => {
    expect(can({ actor, grants, permission: "clients:read", clientId: CLIENT_B })).toBe(false);
  });

  it("cannot read finance data — no role default, no grant", () => {
    expect(can({ actor, grants, permission: "finance:read" })).toBe(false);
  });

  it("cannot write to the client they can only read", () => {
    expect(can({ actor, grants, permission: "clients:write", clientId: CLIENT_A })).toBe(false);
  });

  it("an org-wide grant (clientId: null) authorizes any client — how CUSTOM roles are built", () => {
    const orgWideGrant: Grant[] = [{ permission: "clients:read", clientId: null }];
    const customActor = { membershipId: "m3", role: "CUSTOM" as const, status: "ACTIVE" as const };
    expect(can({ actor: customActor, grants: orgWideGrant, permission: "clients:read", clientId: CLIENT_B })).toBe(true);
  });
});

describe("can() — Section 38 scenario: cross-client access fails even if identifiers are guessed", () => {
  it("a DESIGNER scoped to client A gets nothing for client B despite matching permission name", () => {
    const actor = { membershipId: "m4", role: "DESIGNER" as const, status: "ACTIVE" as const };
    const grants: Grant[] = [{ permission: "clients:read", clientId: CLIENT_A }];
    expect(can({ actor, grants, permission: "clients:read", clientId: CLIENT_B })).toBe(false);
  });

  it("a client-scoped permission with no clientId provided at all is denied, not treated as org-wide", () => {
    const actor = { membershipId: "m5", role: "ACCOUNT_MANAGER" as const, status: "ACTIVE" as const };
    const grants: Grant[] = [{ permission: "clients:read", clientId: CLIENT_A }];
    expect(can({ actor, grants, permission: "clients:read" })).toBe(false);
  });
});

describe("canManageMembership — Section 2.3 role/permission escalation gate", () => {
  it("only an OWNER can change another OWNER's role or revoke them", () => {
    expect(canManageMembership({ actorRole: "ADMIN", targetRole: "OWNER", targetIsLastOwner: false })).toBe(false);
    expect(canManageMembership({ actorRole: "OWNER", targetRole: "OWNER", targetIsLastOwner: false })).toBe(true);
  });

  it("the last remaining OWNER can never be demoted or revoked by anyone", () => {
    expect(canManageMembership({ actorRole: "OWNER", targetRole: "OWNER", targetIsLastOwner: true })).toBe(false);
  });

  it("ADMIN can manage non-owner roles", () => {
    expect(canManageMembership({ actorRole: "ADMIN", targetRole: "ACCOUNT_MANAGER", targetIsLastOwner: false })).toBe(true);
  });
});

describe("can() — Section 15.2 scenario: a Client Portal contact is scoped to exactly their own client", () => {
  const actor = { membershipId: "m6", role: "CLIENT_PORTAL" as const, status: "ACTIVE" as const };
  const grants: Grant[] = [
    { permission: "clients:read", clientId: CLIENT_A },
    { permission: "approvals:decide", clientId: CLIENT_A },
  ];

  it("can decide approvals for their own client", () => {
    expect(can({ actor, grants, permission: "approvals:decide", clientId: CLIENT_A })).toBe(true);
  });

  it("cannot decide approvals for a different client", () => {
    expect(can({ actor, grants, permission: "approvals:decide", clientId: CLIENT_B })).toBe(false);
  });

  it("has no write access even to their own client — approvals:decide is not clients:write", () => {
    expect(can({ actor, grants, permission: "clients:write", clientId: CLIENT_A })).toBe(false);
  });

  it("has no organization-wide permissions at all", () => {
    expect(can({ actor, grants, permission: "organization:manage" })).toBe(false);
    expect(can({ actor, grants, permission: "finance:read" })).toBe(false);
  });
});
