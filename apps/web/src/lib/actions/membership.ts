"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Permission, Role } from "@cedar/domain";
import { getCurrentActor } from "../current-actor";
import { changeMemberRole, grantClientScope, revokeMembership } from "../services/membership-service";

export async function changeRoleAction(formData: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  await changeMemberRole({
    actorUserId: actor.user.id,
    organizationId: actor.organizationId,
    targetMembershipId: String(formData.get("membershipId") ?? ""),
    newRole: String(formData.get("role") ?? "") as Role,
  });

  revalidatePath("/team");
}

export async function revokeMembershipAction(formData: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  await revokeMembership({
    actorUserId: actor.user.id,
    organizationId: actor.organizationId,
    targetMembershipId: String(formData.get("membershipId") ?? ""),
  });

  revalidatePath("/team");
}

export async function grantClientScopeAction(formData: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  await grantClientScope({
    actorUserId: actor.user.id,
    organizationId: actor.organizationId,
    targetMembershipId: String(formData.get("membershipId") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    permission: String(formData.get("permission") ?? "") as Permission,
  });

  revalidatePath("/team");
}
