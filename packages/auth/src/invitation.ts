import { prisma } from "@cedar/db";
import type { Role } from "@cedar/domain";
import { generateToken, hashToken } from "./tokens";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvitation(params: {
  organizationId: string;
  email: string;
  role: Role;
  invitedById: string;
}) {
  const token = generateToken();
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: params.organizationId,
      email: params.email.toLowerCase().trim(),
      role: params.role,
      tokenHash: hashToken(token),
      invitedById: params.invitedById,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  return { token, invitation };
}

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

  return membership;
}
