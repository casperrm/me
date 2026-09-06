import { prisma } from "@cedar/db";
import type { Role } from "@cedar/domain";
import { generateToken, hashToken } from "./tokens";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvitation(params: {
  organizationId: string;
  email: string;
  role: Role;
  invitedById: string;
  /** Required in practice for CLIENT_PORTAL invites — see Section 15.2. */
  clientId?: string;
}) {
  const token = generateToken();
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: params.organizationId,
      email: params.email.toLowerCase().trim(),
      role: params.role,
      clientId: params.clientId,
      tokenHash: hashToken(token),
      invitedById: params.invitedById,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  return { token, invitation };
}

/**
 * Creates the Membership and marks the invitation accepted. Returns the
 * invitation alongside it so callers with product-specific policy (e.g.
 * "a CLIENT_PORTAL invite's clientId should become a ScopedGrant on
 * accept") can act on `invitation.role`/`invitation.clientId` without
 * this generic identity package needing to know about the permission
 * catalog — see apps/web's membership-service.ts for that logic.
 */
export async function acceptInvitation(token: string, userId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });

  if (!invitation) throw new Error("Invitation not found");
  if (invitation.revokedAt) throw new Error("Invitation has been revoked");
  if (invitation.acceptedAt) throw new Error("Invitation already accepted");
  if (invitation.expiresAt.getTime() < Date.now()) throw new Error("Invitation has expired");

  const [membership] = await prisma.$transaction([
    prisma.membership.create({
      data: {
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
        status: "ACTIVE",
        invitedById: invitation.invitedById,
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  return { membership, invitation };
}
