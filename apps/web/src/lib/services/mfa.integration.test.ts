// Integration test for MFA (Bible Section 23.1: "MFA for privileged
// users"). See identity.integration.test.ts for why next/headers and
// server-only are mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => {
  const cookieStore = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
      set: (name: string, value: string) => {
        cookieStore.set(name, value);
      },
      delete: (name: string) => {
        cookieStore.delete(name);
      },
    }),
    headers: async () => new Map<string, string>(),
  };
});

import { prisma } from "@cedar/db";
import { authenticator } from "otplib";
import { hashToken } from "@cedar/auth";
import { AuthError, bootstrapOrganization, login } from "./auth-service";
import { completeMfaLogin, confirmMfaEnrollment, disableMfa, startMfaEnrollment } from "./mfa-service";
import { getSessionToken } from "../session-cookie";

async function wipeDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.pendingMfaLogin.deleteMany();
  await prisma.mfaRecoveryCode.deleteMany();
  await prisma.scopedGrant.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

const PASSWORD = "correct-horse-battery";
let userId: string;

beforeAll(async () => {
  await wipeDatabase();
  await bootstrapOrganization({ orgName: "MFA Test Agency", name: "Owner", email: "mfa-owner@test.example", password: PASSWORD });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "mfa-owner@test.example" } });
  userId = user.id;
});

afterAll(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe("MFA enrollment", () => {
  it("starts enrollment without enabling MFA yet", async () => {
    const { secret, otpauthUri, qrCodeDataUrl } = await startMfaEnrollment(userId);
    expect(secret).toBeTruthy();
    expect(otpauthUri).toContain("otpauth://totp/");
    expect(qrCodeDataUrl).toContain("data:image/png;base64,");

    const stillDisabled = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stillDisabled.mfaEnabled).toBe(false);
    expect(stillDisabled.mfaSecretEncrypted).toBeTruthy();
  });

  it("rejects a wrong confirmation code", async () => {
    await expect(confirmMfaEnrollment(userId, "000000")).rejects.toThrow(AuthError);
  });

  it("enables MFA and issues 10 unique recovery codes on the correct code", async () => {
    // Re-start enrollment to get a fresh known secret (allowed while
    // unconfirmed), then confirm with a real code generated against it.
    const { secret } = await startMfaEnrollment(userId);
    const validToken = authenticator.generate(secret);

    const { recoveryCodes } = await confirmMfaEnrollment(userId, validToken);
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);

    const enabled = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(enabled.mfaEnabled).toBe(true);
  });

  it("refuses to re-enroll while already enabled", async () => {
    await expect(startMfaEnrollment(userId)).rejects.toThrow(AuthError);
  });
});

describe("login with MFA enabled", () => {
  it("does not create a session on password alone — returns a pending challenge instead", async () => {
    const sessionsBefore = await prisma.session.count({ where: { userId } });

    const result = await login({ email: "mfa-owner@test.example", password: PASSWORD });
    expect(result.mfaRequired).toBe(true);
    expect(result.pendingToken).toBeTruthy();

    const sessionsAfter = await prisma.session.count({ where: { userId } });
    expect(sessionsAfter).toBe(sessionsBefore);
  });

  it("rejects a wrong code and leaves the pending login usable for a subsequent attempt", async () => {
    const { pendingToken } = await login({ email: "mfa-owner@test.example", password: PASSWORD });
    await expect(completeMfaLogin(pendingToken!, "000000")).rejects.toThrow(AuthError);

    const stillPending = await prisma.pendingMfaLogin.findUnique({ where: { tokenHash: hashToken(pendingToken!) } });
    expect(stillPending).toBeTruthy();
  });

  it("rejects an expired pending login", async () => {
    const { pendingToken } = await login({ email: "mfa-owner@test.example", password: PASSWORD });
    await prisma.pendingMfaLogin.update({
      where: { tokenHash: hashToken(pendingToken!) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(completeMfaLogin(pendingToken!, "000000")).rejects.toThrow(AuthError);
  });

  it("completes login with a valid recovery code, and that same code cannot be reused", async () => {
    // Disable and re-enroll here to get a batch of plaintext recovery
    // codes this test actually has (confirmMfaEnrollment is the only
    // place they're ever returned in plaintext).
    await disableMfa(userId, PASSWORD);
    const { secret } = await startMfaEnrollment(userId);
    const validToken = authenticator.generate(secret);
    const { recoveryCodes } = await confirmMfaEnrollment(userId, validToken);

    const { pendingToken } = await login({ email: "mfa-owner@test.example", password: PASSWORD });
    await completeMfaLogin(pendingToken!, recoveryCodes[0]);

    const sessionToken = await getSessionToken();
    expect(sessionToken).toBeTruthy();

    const usedUp = await prisma.mfaRecoveryCode.count({ where: { userId, usedAt: { not: null } } });
    expect(usedUp).toBe(1);

    // Reusing the same recovery code must fail.
    const { pendingToken: secondPendingToken } = await login({ email: "mfa-owner@test.example", password: PASSWORD });
    await expect(completeMfaLogin(secondPendingToken!, recoveryCodes[0])).rejects.toThrow(AuthError);

    // A fresh, unused code still works.
    await completeMfaLogin(secondPendingToken!, recoveryCodes[1]);
  });

  it("completes login with a valid TOTP code", async () => {
    // Re-enroll again for a secret this test controls directly.
    await disableMfa(userId, PASSWORD);
    const { secret } = await startMfaEnrollment(userId);
    const validToken = authenticator.generate(secret);
    await confirmMfaEnrollment(userId, validToken);

    const { pendingToken } = await login({ email: "mfa-owner@test.example", password: PASSWORD });
    await completeMfaLogin(pendingToken!, authenticator.generate(secret));

    const sessionToken = await getSessionToken();
    expect(sessionToken).toBeTruthy();

    // This specific pending login was consumed — a completed challenge
    // is always deleted, never left around for reuse.
    const thisOne = await prisma.pendingMfaLogin.findUnique({ where: { tokenHash: hashToken(pendingToken!) } });
    expect(thisOne).toBeNull();
  });
});

describe("disableMfa", () => {
  it("requires the correct password", async () => {
    await expect(disableMfa(userId, "wrong-password")).rejects.toThrow(AuthError);
  });

  it("disables MFA and clears recovery codes on the correct password", async () => {
    await disableMfa(userId, PASSWORD);

    const disabled = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(disabled.mfaEnabled).toBe(false);
    expect(disabled.mfaSecretEncrypted).toBeNull();

    const remainingCodes = await prisma.mfaRecoveryCode.count({ where: { userId } });
    expect(remainingCodes).toBe(0);

    // Login now succeeds directly, no MFA challenge.
    const result = await login({ email: "mfa-owner@test.example", password: PASSWORD });
    expect(result.mfaRequired).toBe(false);
  });
});
