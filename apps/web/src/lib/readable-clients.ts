import "server-only";
import { isAuthorized } from "@cedar/auth";
import { prisma } from "@cedar/db";
import type { getCurrentActor } from "./current-actor";

type Actor = NonNullable<Awaited<ReturnType<typeof getCurrentActor>>>;

/**
 * Returns `undefined` when the actor can read every client in the
 * organization (role default or an org-wide ScopedGrant), or the specific
 * list of client IDs they've been scoped to otherwise. Shared by every
 * page/query that needs to filter clients by what the actor can actually
 * see (Bible Section 38: a scoped collaborator only ever sees clients
 * they've been granted).
 */
export async function getReadableClientIds(actor: Actor): Promise<string[] | undefined> {
  const canReadAll = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:read",
  });
  if (canReadAll) return undefined;

  const grants = await prisma.scopedGrant.findMany({
    where: { membershipId: actor.membership.id, permission: "clients:read", clientId: { not: null } },
    select: { clientId: true },
  });
  return grants.map((g) => g.clientId as string);
}

/**
 * The write-side mirror of `getReadableClientIds` above — same contract
 * (`undefined` = every client in the org, an array = exactly those
 * clients), but for `clients:write`. Used by pages that need to build a
 * "which clients can I create/edit records for" picker across the whole
 * organization rather than one client already in scope (e.g. the
 * `/meetings` page's "+ New meeting" client select).
 */
export async function getWritableClientIds(actor: Actor): Promise<string[] | undefined> {
  const canWriteAll = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
  });
  if (canWriteAll) return undefined;

  const grants = await prisma.scopedGrant.findMany({
    where: { membershipId: actor.membership.id, permission: "clients:write", clientId: { not: null } },
    select: { clientId: true },
  });
  return grants.map((g) => g.clientId as string);
}
