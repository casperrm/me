import QRCode from "qrcode";
import {
  buildOtpAuthUri,
  createSession,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hashToken,
  verifyPassword,
  verifyTotp,
} from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { setSessionCookie } from "../session-cookie";
import { AuthError, requestMeta } from "./auth-service";

/**
 * Starts (or restarts) MFA enrollment for the caller's own account.
 * Section 23.1: "MFA for privileged users" — this is a personal security
 * setting, never something one member sets for another, so this always
 * acts on `userId` from the authenticated session, never a parameter
 * supplied by a request body.
 */
export async function startMfaEnrollment(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaEnabled) throw new AuthError("MFA is already enabled on this account. Disable it first to re-enroll.");

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecretEncrypted: encryptSecret(secret) } });

  const otpauthUri = buildOtpAuthUri(user.email, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

  return { secret, otpauthUri, qrCodeDataUrl };
}

/** Confirms enrollment with a real code from the authenticator app, then issues one-time recovery codes. */
export async function confirmMfaEnrollment(userId: string, token: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecretEncrypted) throw new AuthError("No MFA enrollment is in progress.");

  const secret = decryptSecret(user.mfaSecretEncrypted);
  if (!verifyTotp(secret, token)) throw new AuthError("That code didn't match. Check your authenticator app and try again.");

  const recoveryCodes = generateRecoveryCodes();

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ]);

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" } });
  if (membership) {
    await emitAuditEvent({
      organizationId: membership.organizationId,
      actorType: "USER",
      actorId: membership.id,
      action: "mfa.enabled",
      resourceType: "User",
      resourceId: userId,
      result: "SUCCESS",
    });
  }

  return { recoveryCodes };
}

/** Disabling MFA requires re-proving the password — never just a click while already signed in. */
export async function disableMfa(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Incorrect password.");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEncrypted: null } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" } });
  if (membership) {
    await emitAuditEvent({
      organizationId: membership.organizationId,
      actorType: "USER",
      actorId: membership.id,
      action: "mfa.disabled",
      resourceType: "User",
      resourceId: userId,
      result: "SUCCESS",
    });
  }
}

/**
 * The second step of login for an MFA-enrolled account (Section 23.1).
 * Accepts either a current TOTP code or an unused recovery code. Only on
 * success does a real session get created — see login()'s doc comment
 * in auth-service.ts for why nothing is issued before this.
 */
export async function completeMfaLogin(pendingToken: string, code: string) {
  const pending = await prisma.pendingMfaLogin.findUnique({ where: { tokenHash: hashToken(pendingToken) } });
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    throw new AuthError("This login attempt has expired. Log in again.");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } });
  const trimmed = code.trim();

  let usedRecoveryCodeId: string | undefined;
  let ok = false;

  if (user.mfaSecretEncrypted && verifyTotp(decryptSecret(user.mfaSecretEncrypted), trimmed)) {
    ok = true;
  } else {
    const recoveryCode = await prisma.mfaRecoveryCode.findFirst({
      where: { userId: user.id, codeHash: hashRecoveryCode(trimmed), usedAt: null },
    });
    if (recoveryCode) {
      ok = true;
      usedRecoveryCodeId = recoveryCode.id;
    }
  }

  if (!ok) throw new AuthError("Invalid code.");

  const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id, status: "ACTIVE" } });
  const meta = await requestMeta();

  await prisma.$transaction([
    prisma.pendingMfaLogin.delete({ where: { id: pending.id } }),
    ...(usedRecoveryCodeId ? [prisma.mfaRecoveryCode.update({ where: { id: usedRecoveryCodeId }, data: { usedAt: new Date() } })] : []),
  ]);

  const { token: sessionToken } = await createSession(user.id, meta);
  await setSessionCookie(sessionToken);

  await emitAuditEvent({
    organizationId: membership.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "session.created",
    resourceType: "User",
    resourceId: user.id,
    result: "SUCCESS",
    sourceIp: meta.ipAddress,
    changeSet: usedRecoveryCodeId ? { mfaMethod: "recovery_code" } : { mfaMethod: "totp" },
  });
}
