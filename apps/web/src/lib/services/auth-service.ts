import { headers } from "next/headers";
import { createSession, hashPassword, revokeSession, verifyPassword, verifySessionToken } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { setSessionCookie, getSessionToken, clearSessionCookie } from "../session-cookie";

export class AuthError extends Error {}

async function requestMeta() {
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

export async function login(input: { email: string; password: string }) {
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
}

export async function logout() {
  const token = await getSessionToken();
  if (token) {
    const session = await verifySessionToken(token);
    if (session) await revokeSession(session.id);
  }
  await clearSessionCookie();
}
