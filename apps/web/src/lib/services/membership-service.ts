import {
  acceptInvitation as acceptInvitationRecord,
  createInvitation as createInvitationRecord,
  createSession,
  hashPassword,
  hashToken,
  requirePermission,
} from "@cedar/auth";
import { canManageMembership, type Permission, type Role } from "@cedar/domain";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { setSessionCookie } from "../session-cookie";
import { AuthError } from "./auth-service";

export async function createInvitation(params: {
  actorUserId: string;
  organizationId: string;
  email: string;
  role: Role;
  /** Required for CLIENT_PORTAL (Section 15.2) — see acceptInvitationFlow. */
  clientId?: string;
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "members:invite",
  });

  if (params.role === "CLIENT_PORTAL" && !params.clientId) {
    throw new AuthError("A Client Portal invite must specify which client it's for.");
  }

  if (params.clientId) {
    const client = await prisma.client.findFirst({ where: { id: params.clientId, organizationId: params.organizationId } });
    if (!client) throw new AuthError("Client not found.");
  }

  const { token, invitation } = await createInvitationRecord({
    organizationId: params.organizationId,
    email: params.email,
    role: params.role,
    invitedById: membership.id,
    clientId: params.clientId,
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "invitation.created",
    resourceType: "Invitation",
    resourceId: invitation.id,
    clientId: params.clientId,
    result: "SUCCESS",
    changeSet: { email: params.email, role: params.role },
  });

  return token;
}

export async function getInvitationPreview(token: string) {
  const invitation = await prisma.invitation.findFirst({
    where: { tokenHash: hashToken(token) },
    include: { client: { select: { name: true } } },
  });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return null;
  }
  return { email: invitation.email, role: invitation.role, clientName: invitation.client?.name ?? null };
}

export async function acceptInvitationFlow(token: string, input: { name: string; password: string }) {
  const invitation = await prisma.invitation.findFirst({ where: { tokenHash: hashToken(token) } });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    throw new AuthError("This invitation is invalid or has expired.");
  }

  const name = input.name.trim();
  if (!name || input.password.length < 8) {
    throw new AuthError("Enter your name and a password of at least 8 characters.");
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (existingUser) {
    throw new AuthError("An account with this email already exists. Log in, then reopen this invite link.");
  }

  const user = await prisma.user.create({
    data: { email: invitation.email, name, passwordHash: await hashPassword(input.password) },
  });

  const { membership } = await acceptInvitationRecord(token, user.id);

  await emitAuditEvent({
    organizationId: invitation.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "invitation.accepted",
    resourceType: "Membership",
    resourceId: membership.id,
    clientId: invitation.clientId,
    result: "SUCCESS",
  });

  // A Client Portal contact must be usable the moment they accept — grant
  // the two permissions the portal needs, scoped to exactly the client
  // the invite was for (Section 15.2). Nothing else touches this
  // membership's ScopedGrants automatically; an admin can add/remove
  // scope later from /team like any other member.
  if (invitation.role === "CLIENT_PORTAL" && invitation.clientId) {
    await prisma.scopedGrant.createMany({
      data: [
        { membershipId: membership.id, clientId: invitation.clientId, permission: "clients:read" },
        { membershipId: membership.id, clientId: invitation.clientId, permission: "approvals:decide" },
      ],
    });
  }

  const { token: sessionToken } = await createSession(user.id);
  await setSessionCookie(sessionToken);
}

// Both mutations below take `expectedVersion` and make the actual write
// conditional on it in the database (`updateMany`'s `where`, not a
// separate read-then-write check — that would still leave a gap between
// checking and writing). `Membership.version` has existed since the
// original schema with a comment invoking Section 27.1's "version/
// concurrency field on collaboratively edited records" and gets
// incremented on every write here, but until now nothing ever compared
// it before writing — the increment happened, but nothing was gated on
// it, so it couldn't actually catch a lost update. Two admins acting on
// the same membership from stale page loads (one revokes while the
// other is mid-role-change, say) would both silently succeed with the
// second unknowingly clobbering the first's change with no warning to
// either admin. See docs/specs/membership-optimistic-concurrency.md.

export async function changeMemberRole(params: {
  actorUserId: string;
  organizationId: string;
  targetMembershipId: string;
  newRole: Role;
  expectedVersion: number;
}) {
  if (!Number.isInteger(params.expectedVersion)) throw new AuthError("Invalid request.");

  const actingMembership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "members:manage",
  });

  const target = await prisma.membership.findUniqueOrThrow({ where: { id: params.targetMembershipId } });
  if (target.organizationId !== params.organizationId) throw new AuthError("Cross-organization membership access denied");

  const ownerCount = await prisma.membership.count({
    where: { organizationId: params.organizationId, role: "OWNER", status: "ACTIVE" },
  });
  const targetIsLastOwner = target.role === "OWNER" && ownerCount <= 1;

  if (!canManageMembership({ actorRole: actingMembership.role, targetRole: target.role, targetIsLastOwner })) {
    throw new AuthError("Not authorized to change this member's role.");
  }

  const { count } = await prisma.membership.updateMany({
    where: { id: target.id, version: params.expectedVersion },
    data: { role: params.newRole, version: { increment: 1 } },
  });
  if (count === 0) {
    throw new AuthError("This member was changed by someone else since the page loaded. Refresh and try again.");
  }

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: actingMembership.id,
    action: "membership.role_changed",
    resourceType: "Membership",
    resourceId: target.id,
    result: "SUCCESS",
    changeSet: { before: { role: target.role }, after: { role: params.newRole } },
  });
}

export async function revokeMembership(params: {
  actorUserId: string;
  organizationId: string;
  targetMembershipId: string;
  expectedVersion: number;
}) {
  if (!Number.isInteger(params.expectedVersion)) throw new AuthError("Invalid request.");

  const actingMembership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "members:manage",
  });

  const target = await prisma.membership.findUniqueOrThrow({ where: { id: params.targetMembershipId } });
  if (target.organizationId !== params.organizationId) throw new AuthError("Cross-organization membership access denied");

  const ownerCount = await prisma.membership.count({
    where: { organizationId: params.organizationId, role: "OWNER", status: "ACTIVE" },
  });
  const targetIsLastOwner = target.role === "OWNER" && ownerCount <= 1;

  if (!canManageMembership({ actorRole: actingMembership.role, targetRole: target.role, targetIsLastOwner })) {
    throw new AuthError("Not authorized to revoke this member.");
  }

  const { count } = await prisma.membership.updateMany({
    where: { id: target.id, version: params.expectedVersion },
    data: { status: "REVOKED", version: { increment: 1 } },
  });
  if (count === 0) {
    throw new AuthError("This member was changed by someone else since the page loaded. Refresh and try again.");
  }

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: actingMembership.id,
    action: "membership.revoked",
    resourceType: "Membership",
    resourceId: target.id,
    result: "SUCCESS",
  });
}

export async function grantClientScope(params: {
  actorUserId: string;
  organizationId: string;
  targetMembershipId: string;
  clientId: string;
  permission: Permission;
}) {
  const actingMembership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "members:manage",
  });

  const [target, client] = await Promise.all([
    prisma.membership.findUniqueOrThrow({ where: { id: params.targetMembershipId } }),
    prisma.client.findUniqueOrThrow({ where: { id: params.clientId } }),
  ]);
  if (target.organizationId !== params.organizationId || client.organizationId !== params.organizationId) {
    throw new AuthError("Cross-organization access denied");
  }

  await prisma.scopedGrant.create({
    data: { membershipId: target.id, clientId: client.id, permission: params.permission, createdBy: actingMembership.id },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: actingMembership.id,
    action: "scoped_grant.created",
    resourceType: "Membership",
    resourceId: target.id,
    clientId: client.id,
    result: "SUCCESS",
    changeSet: { permission: params.permission },
  });
}
