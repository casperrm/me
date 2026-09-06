"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../current-actor";
import { setTaskStatus, type TaskStatus } from "../services/project-service";

export async function setTaskStatusAction(formData: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatus;
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  await setTaskStatus({ actorUserId: actor.user.id, organizationId: actor.organizationId, taskId, status });

  revalidatePath(`/clients/${clientId}/projects/${projectId}`);
}
