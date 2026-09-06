// Mirrors the `Role` enum in packages/db/prisma/schema.prisma. Kept as an
// independent type (not imported from @prisma/client) because domain
// policy must not depend on the ORM (Bible Section 35.1: "Never place
// domain logic in UI components or provider adapters" — the inverse holds
// too, domain shouldn't reach down into a specific persistence library).
export type Role =
  | "OWNER"
  | "ADMIN"
  | "ACCOUNT_MANAGER"
  | "ADS_MANAGER"
  | "DESIGNER"
  | "VIDEO_PRODUCTION"
  | "FINANCE"
  | "CLIENT_PORTAL"
  | "CUSTOM";

export type MembershipStatus = "ACTIVE" | "INVITED" | "REVOKED";

// Permission catalog. Section 2.2 describes the full authorization
// dimensions (resource, action, scope, sensitivity, approval rule) this
// will eventually grow into; Phase 0 only needs enough permissions to
// cover identity/access administration and to prove client isolation
// (Section 38 acceptance scenarios), so this list is intentionally short.
// Extend it as each module lands rather than pre-declaring permissions
// nothing checks yet.
export type Permission =
  | "organization:manage"
  | "members:invite"
  | "members:manage"
  | "audit:read"
  | "clients:read"
  | "clients:write"
  | "finance:read"
  | "finance:write"
  | "approvals:decide";

export const ALL_PERMISSIONS: Permission[] = [
  "organization:manage",
  "members:invite",
  "members:manage",
  "audit:read",
  "clients:read",
  "clients:write",
  "finance:read",
  "finance:write",
  "approvals:decide",
];

// Permissions a role holds organization-wide, with no client scoping
// needed. Anything not listed here for a role can still be granted per
// client (or org-wide) via an explicit ScopedGrant — see policy.ts.
//
// OWNER is intentionally absent: policy.ts short-circuits OWNER to "can do
// anything" rather than listing every permission here, so a new
// permission added to the catalog is automatically available to OWNER
// without this map needing an edit.
export const ROLE_GLOBAL_PERMISSIONS: Record<Exclude<Role, "OWNER">, Permission[]> = {
  ADMIN: [
    "organization:manage",
    "members:invite",
    "members:manage",
    "audit:read",
    "clients:read",
    "clients:write",
    "finance:read",
    "finance:write",
    "approvals:decide",
  ],
  // Client-facing roles get nothing organization-wide by default — access
  // to a specific client comes from a ScopedGrant (Section 2.2: "scope"
  // dimension). This is what makes "assign a scoped role" in the Section
  // 38 acceptance scenario meaningful rather than a no-op.
  ACCOUNT_MANAGER: [],
  ADS_MANAGER: [],
  DESIGNER: [],
  VIDEO_PRODUCTION: [],
  FINANCE: ["finance:read", "finance:write", "clients:read"],
  // The Client Portal (Section 15.2): a real external client contact,
  // scoped via ScopedGrant to exactly their own client(s) with
  // "clients:read" (a curated /portal view, not the internal Client 360
  // page) and "approvals:decide" (so THEIR decision — not an internal
  // team member's free-text stand-in — is what gets recorded). Nothing
  // else: no clients:write, no visibility into other clients, no
  // organization-wide anything.
  CLIENT_PORTAL: [],
  CUSTOM: [], // entirely defined by ScopedGrant rows
};

// Permissions that make sense to hold per-client (via ScopedGrant) rather
// than only organization-wide. Anything in this list can be granted with
// a clientId; permissions outside it (e.g. "organization:manage") are
// always organization-wide regardless of what a ScopedGrant row says.
export const CLIENT_SCOPABLE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "clients:read",
  "clients:write",
  "approvals:decide",
]);
