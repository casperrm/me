// Org-wide MFA enforcement policy — the enforcement half of Section 23.1
// ("MFA for privileged users") that docs/specs/mfa.md's original scope
// boundary named as not yet built: the mechanism (mfa-service.ts) existed
// as per-user opt-in, but nothing forced OWNER/ADMIN accounts to enroll.
//
// This is deliberately a single organization-wide boolean, not a
// per-role configurable list: Section 23.1's own wording is "privileged
// users," and in this app's role catalog OWNER and ADMIN are the two
// roles that hold organization-wide `organization:manage` by construction
// (see packages/domain/src/roles.ts) — the roles a compromised account
// could do the most damage from. A future per-role policy builder is a
// reasonable next increment (Section 37 already anticipates one for
// permissions generally), not built here to avoid a data-driven policy
// table nothing yet needs.
import { requirePermission } from "@cedar/auth";
import { MFA_PRIVILEGED_ROLES } from "@cedar/domain";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

// MFA_PRIVILEGED_ROLES now lives in packages/domain/src/roles.ts (its
// canonical home — packages/auth's requirePermission/requireAnyPermission
// need the same list for the API-level half of this gate, see
// docs/specs/mfa.md). Re-exported here so any existing import of it from
// this module keeps working unchanged.
export { MFA_PRIVILEGED_ROLES };

export interface MfaPolicy {
  requiredForPrivilegedRoles: boolean;
}

/**
 * No permission gate — every member of the org can see whether the
 * policy is on (mirrors getAiBudgetStatus's read side), and this is also
 * called on every authenticated page load (see AppLayout) so it must stay
 * a single cheap lookup, not something wrapped in its own authorization
 * round trip.
 */
export async function getMfaPolicy(organizationId: string): Promise<MfaPolicy> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { mfaRequiredForPrivilegedRoles: true },
  });
  return { requiredForPrivilegedRoles: org.mfaRequiredForPrivilegedRoles };
}

/**
 * organization:manage-gated, same permission tier as the AI budget and
 * Integration Center org-wide toggles — this is an organizational
 * security decision, not a personal one (contrast mfa-service.ts, which
 * only ever acts on the caller's own account).
 */
export async function setMfaRequiredForPrivilegedRoles(params: {
  actorUserId: string;
  organizationId: string;
  required: boolean;
}): Promise<MfaPolicy> {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "organization:manage",
  });

  if (typeof params.required !== "boolean") {
    throw new AuthError("required must be a boolean.");
  }

  const org = await prisma.organization.update({
    where: { id: params.organizationId },
    data: { mfaRequiredForPrivilegedRoles: params.required },
    select: { mfaRequiredForPrivilegedRoles: true },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "mfa_policy.updated",
    resourceType: "Organization",
    resourceId: params.organizationId,
    result: "SUCCESS",
    changeSet: { requiredForPrivilegedRoles: params.required },
  });

  return { requiredForPrivilegedRoles: org.mfaRequiredForPrivilegedRoles };
}

/**
 * The actual gate check, called from AppLayout on every internal page
 * load. True only when all three hold: the actor's role is privileged
 * (OWNER/ADMIN), the org has turned the policy on, and this specific user
 * hasn't enrolled yet. A user who already enrolled is never gated again
 * even if the org later requires it for everyone else's role — nothing
 * here forces re-enrollment or a stronger factor, only that enrollment
 * has happened at all.
 */
export async function isMfaEnrollmentRequired(actor: {
  organizationId: string;
  membership: { role: string };
  user: { mfaEnabled: boolean };
}): Promise<boolean> {
  if (!(MFA_PRIVILEGED_ROLES as readonly string[]).includes(actor.membership.role)) return false;
  if (actor.user.mfaEnabled) return false;
  const policy = await getMfaPolicy(actor.organizationId);
  return policy.requiredForPrivilegedRoles;
}
