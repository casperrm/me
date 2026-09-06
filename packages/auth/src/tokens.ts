import { randomBytes, createHash } from "node:crypto";

/** Raw, unguessable token to hand to a client (cookie, invite link). */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** What we store in the database — never the raw token (Section 23.1). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
