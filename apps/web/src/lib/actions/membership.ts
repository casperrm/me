"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Permission, Role } from "@cedar/domain";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "../current-actor";
import { AuthError } from "../services/auth-service";
import { changeMemberRole, grantClientScope, revokeMembership } from "../services/membership-service";

// See task.ts's identical helper's doc comment — the same
// AuthorizationError/MfaRequiredError gap applies to every write path
// here too, since changeMemberRole/revokeMembership/grantClientScope all
// go through requirePermission internally.
function actionErrorMessage(err: unknown): string | undefined {
  if (err instanceof AuthError) return err.message;
  if (err instanceof MfaRequiredError) return err.message;
  if (err instanceof AuthorizationError) return "You don't have permission to do that.";
  return undefined;
}

// The Team page only hides these forms for the *last remaining* OWNER
// (policy.ts's canManageMembership treats that as never manageable). It
// does not hide them when the target is a non-last OWNER and the actor is
// an ADMIN rather than an OWNER - policy.ts also forbids that combination
// ("only an OWNER can change another OWNER's role"), so an ADMIN acting on
// a co-OWNER is a real, reachable case, not a hypothetical one. Returning
// the error instead of letting it propagate keeps that mistake from
// blanking the whole Team page via error.tsx.
export async function changeRoleAction(formData: FormData): Promise<{ error: string } | undefined> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  try {
    await changeMemberRole({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      targetMembershipId: String(formData.get("membershipId") ?? ""),
      newRole: String(formData.get("role") ?? "") as Role,
      expectedVersion: Number(formData.get("expectedVersion")),
    });
  } catch (err) {
    const message = actionErrorMessage(err);
    if (message) {
      // Refresh even on failure: a version-conflict error means someone
      // else's change is now the current truth, so the stale row (and
      // its stale expectedVersion hidden input) this form was rendered
      // from should be replaced with what's actually in the database.
      revalidatePath("/team");
      return { error: message };
    }
    throw err;
  }

  revalidatePath("/team");
}

export async function revokeMembershipAction(formData: FormData): Promise<{ error: string } | undefined> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  try {
    await revokeMembership({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      targetMembershipId: String(formData.get("membershipId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion")),
    });
  } catch (err) {
    const message = actionErrorMessage(err);
    if (message) {
      revalidatePath("/team");
      return { error: message };
    }
    throw err;
  }

  revalidatePath("/team");
}

export async function grantClientScopeAction(formData: FormData): Promise<{ error: string } | undefined> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  try {
    await grantClientScope({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      targetMembershipId: String(formData.get("membershipId") ?? ""),
      clientId: String(formData.get("clientId") ?? ""),
      permission: String(formData.get("permission") ?? "") as Permission,
    });
  } catch (err) {
    const message = actionErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidatePath("/team");
}
