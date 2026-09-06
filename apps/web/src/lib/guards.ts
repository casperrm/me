import "server-only";
import { redirect } from "next/navigation";
import { isAuthorized } from "@cedar/auth";
import type { Permission } from "@cedar/domain";
import { getCurrentActor } from "./current-actor";

/** Redirects to /login when there is no valid session. Use at the top of every protected page. */
export async function requireActor() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  return actor;
}

export interface PermissionCheck {
  allowed: boolean;
  actor: Awaited<ReturnType<typeof getCurrentActor>>;
}

/**
 * Same as requireActor, but also checks a permission and returns the
 * result instead of throwing — pages render their own permission-denied
 * state with this (Bible Section 0.2 requires a distinct
 * "permission-denied" UI state, not a generic error or a silent redirect).
 */
export async function checkPermission(permission: Permission, clientId?: string): Promise<PermissionCheck> {
  const actor = await requireActor();
  const allowed = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission,
    clientId,
  });
  return { allowed, actor };
}
