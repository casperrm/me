"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../current-actor";
import { setTaskEstimate, setTaskPriority, setTaskStatus, type TaskPriority, type TaskStatus } from "../services/project-service";

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

export async function setTaskPriorityAction(formData: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const taskId = String(formData.get("taskId") ?? "");
  const priority = String(formData.get("priority") ?? "") as TaskPriority;
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  await setTaskPriority({ actorUserId: actor.user.id, organizationId: actor.organizationId, taskId, priority });

  revalidatePath(`/clients/${clientId}/projects/${projectId}`);
}

export async function setTaskEstimateAction(formData: FormData) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const taskId = String(formData.get("taskId") ?? "");
  const raw = String(formData.get("estimateHours") ?? "").trim();
  const estimateHours = raw === "" ? null : Number(raw);
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  await setTaskEstimate({ actorUserId: actor.user.id, organizationId: actor.organizationId, taskId, estimateHours });

  revalidatePath(`/clients/${clientId}/projects/${projectId}`);
}
