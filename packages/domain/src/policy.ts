import { CLIENT_SCOPABLE_PERMISSIONS, ROLE_GLOBAL_PERMISSIONS, type MembershipStatus, type Permission, type Role } from "./roles";

export interface ActorContext {
  membershipId: string;
  role: Role;
  status: MembershipStatus;
}

// A grant with clientId === null means organization-wide for that
// permission (how a CUSTOM role's access is built up, or how an
// exception is made for one member without changing their role).
export interface Grant {
  permission: Permission;
  clientId: string | null;
}

export interface AuthorizationRequest {
  actor: ActorContext;
  grants: Grant[];
  permission: Permission;
  /** Required when checking a client-scoped permission against a specific client. */
  clientId?: string;
}

/**
 * The single authorization decision function every server-side check goes
 * through (Bible Section 35.1: "Authorization is a first-class application
 * policy, not scattered UI conditionals"). Pure function, no I/O — callers
 * (packages/auth) are responsible for loading the actor's membership and
 * grants from the database first.
 */
export function can(req: AuthorizationRequest): boolean {
  const { actor, grants, permission, clientId } = req;

  if (actor.status !== "ACTIVE") return false;
  if (actor.role === "OWNER") return true;

  const globalDefaults = ROLE_GLOBAL_PERMISSIONS[actor.role] ?? [];
  if (globalDefaults.includes(permission)) return true;

  const hasOrgWideGrant = grants.some((g) => g.permission === permission && g.clientId === null);
  if (hasOrgWideGrant) return true;

  if (CLIENT_SCOPABLE_PERMISSIONS.has(permission) && clientId) {
    return grants.some((g) => g.permission === permission && g.clientId === clientId);
  }

  return false;
}

/**
 * Contextual constraint beyond plain permission checks (Section 2.3:
 * role/permission escalation is a non-negotiable approval gate). No role
 * other than OWNER may change or revoke an OWNER's membership, and no one
 * may demote the last remaining OWNER — enforced here so it can't be
 * bypassed by whatever UI happens to call into membership management.
 */
export function canManageMembership(params: {
  actorRole: Role;
  targetRole: Role;
  targetIsLastOwner: boolean;
}): boolean {
  if (params.targetRole === "OWNER" && params.actorRole !== "OWNER") return false;
  if (params.targetIsLastOwner) return false;
  return true;
}

export * from "./roles";
