import { headers } from "next/headers";
import { createSession, generateToken, hashPassword, hashToken, revokeSession, verifyPassword, verifySessionToken } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { setSessionCookie, getSessionToken, clearSessionCookie } from "../session-cookie";

const PENDING_MFA_TTL_MS = 5 * 60 * 1000;

export class AuthError extends Error {}

export async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

/**
 * One-time flow: creates the first Organization + OWNER when the database
 * has none yet. Everyone after this comes through an invitation (Bible
 * Section 2.1/29: invite-only access).
 */
export async function bootstrapOrganization(input: { orgName: string; name: string; email: string; password: string }) {
  const existingOrgCount = await prisma.organization.count();
  if (existingOrgCount > 0) {
    throw new AuthError("An organization already exists. Log in instead.");
  }

  const orgName = input.orgName.trim();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!orgName || !name || !email || input.password.length < 8) {
    throw new AuthError("All fields are required and the password must be at least 8 characters.");
  }

  const { org, membership } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({
      data: { email, name, passwordHash: await hashPassword(input.password) },
    });
    const membership = await tx.membership.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" },
    });
    return { org, membership };
  });

  await emitAuditEvent({
    organizationId: org.id,
    actorType: "USER",
    actorId: membership.id,
    action: "organization.created",
    resourceType: "Organization",
    resourceId: org.id,
    result: "SUCCESS",
  });

  const { token } = await createSession(membership.userId, await requestMeta());
  await setSessionCookie(token);
}

/**
 * Returns either `{ mfaRequired: false }` (a session was created — same
 * as before MFA existed) or `{ mfaRequired: true, pendingToken }` when
 * the account has MFA enabled (Section 23.1): the password was correct,
 * but no session is created until completeMfaLogin succeeds with that
 * pendingToken. Never create a session on password verification alone
 * once MFA is enabled — that would make MFA decorative.
 */
export async function login(input: { email: string; password: string }): Promise<{ mfaRequired: boolean; pendingToken?: string }> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;

  if (!user || !valid) {
    throw new AuthError("Invalid email or password.");
  }

  const membership = await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE" } });
  if (!membership) {
    throw new AuthError("This account has no active organization membership.");
  }

  if (user.mfaEnabled) {
    const pendingToken = generateToken();
    await prisma.pendingMfaLogin.create({
      data: { userId: user.id, tokenHash: hashToken(pendingToken), expiresAt: new Date(Date.now() + PENDING_MFA_TTL_MS) },
    });
    return { mfaRequired: true, pendingToken };
  }

  const meta = await requestMeta();
  const { token } = await createSession(user.id, meta);
  await setSessionCookie(token);

  await emitAuditEvent({
    organizationId: membership.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "session.created",
    resourceType: "User",
    resourceId: user.id,
    result: "SUCCESS",
    sourceIp: meta.ipAddress,
  });

  return { mfaRequired: false };
}

export async function logout() {
  const token = await getSessionToken();
  if (token) {
    const session = await verifySessionToken(token);
    if (session) await revokeSession(session.id);
  }
  await clearSessionCookie();
}

/**
 * Section 23.1: "secure session lifecycle, and device/session revocation."
 * The `Session` model and packages/auth's revokeSession already existed,
 * but nothing besides self-logout ever called them — a user had no way to
 * see what's signed in as them or kick out a device that isn't theirs
 * anymore. Self-scoped only (every user manages their own sessions), so
 * no requirePermission/organization check applies here, matching the MFA
 * setup/disable routes' own established shape for account-security
 * actions.
 */
export async function listMySessions(userId: string, currentSessionId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
  });

  return sessions.map((s) => ({ ...s, isCurrent: s.id === currentSessionId }));
}

export async function revokeMySession(params: { userId: string; membershipId: string; organizationId: string; sessionId: string }) {
  const session = await prisma.session.findUnique({ where: { id: params.sessionId } });
  if (!session || session.userId !== params.userId) {
    throw new AuthError("Session not found.");
  }
  if (session.revokedAt) return;

  await revokeSession(params.sessionId);

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: params.membershipId,
    action: "session.revoked",
    resourceType: "Session",
    resourceId: params.sessionId,
    result: "SUCCESS",
  });
}

/**
 * Excludes the caller's own current session deliberately — unlike
 * packages/auth's revokeAllSessionsForUser (which revokes everything,
 * intended for a future forced-logout-everywhere/incident-response use),
 * this is the self-service "log out my other devices" action and
 * shouldn't sign the user out of the very session performing it.
 */
export async function revokeAllOtherSessions(params: { userId: string; membershipId: string; organizationId: string; currentSessionId: string }) {
  const { count } = await prisma.session.updateMany({
    where: { userId: params.userId, revokedAt: null, id: { not: params.currentSessionId } },
    data: { revokedAt: new Date() },
  });

  if (count > 0) {
    await emitAuditEvent({
      organizationId: params.organizationId,
      actorType: "USER",
      actorId: params.membershipId,
      action: "session.revoked_all_others",
      resourceType: "User",
      resourceId: params.userId,
      result: "SUCCESS",
      changeSet: { count },
    });
  }

  return count;
}
