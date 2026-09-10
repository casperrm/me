"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../current-actor";
import { AuthError } from "../services/auth-service";
import { setTaskEstimate, setTaskPriority, setTaskStatus, type TaskPriority, type TaskStatus } from "../services/project-service";

// Unlike the two sibling actions below, this one can fail for a reason a
// user can trigger in the ordinary course of using the page (marking a
// task "done" while a blocker that was open when this page was rendered
// gets completed, or vice versa a new blocker is added, before the user
// submits) - see setTaskStatus's blocked-task check. Returning the error
// instead of letting it propagate means the page's error.tsx boundary
// (a full-page replacement) isn't what a user sees for an ordinary,
// recoverable mistake.
export async function setTaskStatusAction(formData: FormData): Promise<{ error: string } | undefined> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatus;
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await setTaskStatus({ actorUserId: actor.user.id, organizationId: actor.organizationId, taskId, status });
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    throw err;
  }

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
