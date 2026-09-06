import "server-only";
import { cache } from "react";
import { verifySessionToken } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { getSessionToken } from "./session-cookie";

/**
 * Resolves the signed-in user and their organization membership from the
 * session cookie. Cached per request (React `cache`) so pages that need
 * this in several places don't each hit the database separately.
 *
 * Phase 0 assumes one organization per user (the seed/bootstrap flow only
 * ever creates one membership) — picking the first ACTIVE membership here
 * is a deliberate simplification, not a security gap: every permission
 * check still goes through packages/auth's requirePermission against that
 * specific membership. An org switcher is a Phase 1+ UI concern once a
 * user can plausibly belong to more than one organization.
 */
export const getCurrentActor = cache(async () => {
  const token = await getSessionToken();
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.userId, status: "ACTIVE" },
    include: { organization: true },
  });

  if (!membership) return null;

  return {
    user: session.user,
    session,
    membership,
    organizationId: membership.organizationId,
  };
});
