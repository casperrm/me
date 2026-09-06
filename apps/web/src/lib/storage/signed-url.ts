import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@cedar/config";

// Mimics S3 presigned-URL semantics (Bible Section 14: "signed,
// time-limited access URLs; never expose storage credentials to
// clients") on top of the local filesystem adapter: the signature *is*
// the authorization at download time, generated only after a page render
// already confirmed the requester has clients:read on the asset's
// client. There is deliberately no second permission check inside the
// download route — that would defeat the point of a link a page can
// safely embed with a short expiry, matching how a real presigned S3 URL
// behaves.
function secret() {
  return loadEnv().SESSION_SECRET;
}

function sign(assetId: string, expiresAt: number): string {
  return createHmac("sha256", secret()).update(`${assetId}.${expiresAt}`).digest("hex");
}

export function verifyAssetToken(assetId: string, token: string): boolean {
  const [expiresAtStr, sig] = token.split(".");
  if (!expiresAtStr || !sig) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(sign(assetId, expiresAt));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function buildSignedDownloadPath(assetId: string, expiresInSeconds = 300): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const token = `${expiresAt}.${sign(assetId, expiresAt)}`;
  return `/api/assets/${assetId}/download?token=${encodeURIComponent(token)}`;
}
