import { prisma } from "@cedar/db";
import { can, type ActorContext, type Grant, type Permission } from "@cedar/domain";

export class AuthorizationError extends Error {
  constructor(permission: Permission, clientId?: string) {
    super(`Not authorized: ${permission}${clientId ? ` (client ${clientId})` : ""}`);
    this.name = "AuthorizationError";
  }
}

export interface AuthorizeParams {
  userId: string;
  organizationId: string;
  permission: Permission;
  clientId?: string;
}

async function loadActorAndGrants(userId: string, organizationId: string) {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { scopedGrants: true },
  });

  if (!membership) return null;

  const actor: ActorContext = {
    membershipId: membership.id,
    role: membership.role,
    status: membership.status,
  };

  const grants: Grant[] = membership.scopedGrants.map((g) => ({
    permission: g.permission as Permission,
    clientId: g.clientId,
  }));

  return { membership, actor, grants };
}

/** Returns true/false — use in server components / read paths that just branch UI. */
export async function isAuthorized(params: AuthorizeParams): Promise<boolean> {
  const loaded = await loadActorAndGrants(params.userId, params.organizationId);
  if (!loaded) return false;
  return can({ actor: loaded.actor, grants: loaded.grants, permission: params.permission, clientId: params.clientId });
}

/**
 * Throws AuthorizationError when denied. Use at the top of every mutating
 * server action / API route handler — Section 35.1: "Authorization is a
 * first-class application policy, not scattered UI conditionals." Returns
 * the actor's membership so callers can attribute the action for auditing.
 */
export async function requirePermission(params: AuthorizeParams) {
  const loaded = await loadActorAndGrants(params.userId, params.organizationId);
  if (!loaded) throw new AuthorizationError(params.permission, params.clientId);

  const allowed = can({
    actor: loaded.actor,
    grants: loaded.grants,
    permission: params.permission,
    clientId: params.clientId,
  });

  if (!allowed) throw new AuthorizationError(params.permission, params.clientId);

  return loaded.membership;
}

export interface AuthorizeAnyParams {
  userId: string;
  organizationId: string;
  permissions: Permission[];
  clientId?: string;
}

/**
 * Passes if the actor holds ANY of the listed permissions for the given
 * scope. Exists for actions two different kinds of actor can legitimately
 * take for different reasons — e.g. recording an approval decision is
 * allowed either by an internal team member's `clients:write` (reviewing
 * their own team's work) or by a Client Portal contact's narrower
 * `approvals:decide` (Section 15.2) — without granting the portal contact
 * `clients:write` just to reuse one check.
 */
export async function isAuthorizedAny(params: AuthorizeAnyParams): Promise<boolean> {
  const loaded = await loadActorAndGrants(params.userId, params.organizationId);
  if (!loaded) return false;
  return params.permissions.some((permission) =>
    can({ actor: loaded.actor, grants: loaded.grants, permission, clientId: params.clientId }),
  );
}

export async function requireAnyPermission(params: AuthorizeAnyParams) {
  const loaded = await loadActorAndGrants(params.userId, params.organizationId);
  if (!loaded) throw new AuthorizationError(params.permissions[0], params.clientId);

  const allowed = params.permissions.some((permission) =>
    can({ actor: loaded.actor, grants: loaded.grants, permission, clientId: params.clientId }),
  );

  if (!allowed) throw new AuthorizationError(params.permissions[0], params.clientId);

  return loaded.membership;
}
