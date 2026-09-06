import { randomBytes, createHash, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { authenticator } from "otplib";
import { loadEnv } from "@cedar/config";

// TOTP window: accept one step before/after the current 30s window to
// tolerate minor clock drift between server and authenticator app.
authenticator.options = { window: 1 };

const ISSUER = "Cedar Point OS";

/** A fresh base32 TOTP secret for a new enrollment attempt. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** The otpauth:// URI an authenticator app (or its QR code) needs to enroll. */
export function buildOtpAuthUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

/** True if `token` is a currently-valid 6-digit code for `secret`. */
export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.check(token.trim(), secret);
  } catch {
    return false;
  }
}

// Secrets are encrypted at rest (Section 23.1: "sensitive secrets stored
// outside application source/database plaintext") with a key derived
// from SESSION_SECRET via scrypt with a distinct, fixed salt — key
// separation from the session-signing use of that same secret, without
// requiring a second secret to generate/rotate/deploy.
function deriveKey(): Buffer {
  const { SESSION_SECRET } = loadEnv();
  return scryptSync(SESSION_SECRET, "cedar-mfa-encryption-v1", 32);
}

/** AES-256-GCM encrypt; output is `iv:authTag:ciphertext`, all hex. */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

const RECOVERY_CODE_COUNT = 10;

/** Human-typeable one-time recovery codes (e.g. "7K3F-9XQ2"), for when the authenticator device is unavailable. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

/** Never store a recovery code in plaintext — same hash-then-compare pattern as session/invitation tokens. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
