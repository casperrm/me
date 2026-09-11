"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "../current-actor";
import { AuthError } from "../services/auth-service";
import { setTaskEstimate, setTaskPriority, setTaskStatus, type TaskPriority, type TaskStatus } from "../services/project-service";

// Every write path below goes through requirePermission/requireAnyPermission
// (inside the service calls), which can throw AuthorizationError or
// MfaRequiredError — not just the AuthError each service itself raises for
// its own business rules. A real, reachable race for the MFA case: an
// owner toggles the organization's MFA-required policy on while another
// privileged user still has a page open from before that change — their
// next submit here would otherwise crash into the page's full-page
// error.tsx boundary instead of showing an inline message (see
// docs/specs/mfa.md's and docs/specs/error-boundaries.md's own "server
// actions still don't catch AuthorizationError/MfaRequiredError" note).
function actionErrorMessage(err: unknown): string | undefined {
  if (err instanceof AuthError) return err.message;
  if (err instanceof MfaRequiredError) return err.message;
  if (err instanceof AuthorizationError) return "You don't have permission to do that.";
  return undefined;
}

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
    const message = actionErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidatePath(`/clients/${clientId}/projects/${projectId}`);
}

export async function setTaskPriorityAction(formData: FormData): Promise<{ error: string } | undefined> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const taskId = String(formData.get("taskId") ?? "");
  const priority = String(formData.get("priority") ?? "") as TaskPriority;
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await setTaskPriority({ actorUserId: actor.user.id, organizationId: actor.organizationId, taskId, priority });
  } catch (err) {
    const message = actionErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidatePath(`/clients/${clientId}/projects/${projectId}`);
}

export async function setTaskEstimateAction(formData: FormData): Promise<{ error: string } | undefined> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");

  const taskId = String(formData.get("taskId") ?? "");
  const raw = String(formData.get("estimateHours") ?? "").trim();
  const estimateHours = raw === "" ? null : Number(raw);
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  try {
    await setTaskEstimate({ actorUserId: actor.user.id, organizationId: actor.organizationId, taskId, estimateHours });
  } catch (err) {
    const message = actionErrorMessage(err);
    if (message) return { error: message };
    throw err;
  }

  revalidatePath(`/clients/${clientId}/projects/${projectId}`);
}
