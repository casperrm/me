import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { promoteFollowUpToTask } from "@/lib/services/meeting-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; followUpId: string }> }) {
  const { id, followUpId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.projectId) return NextResponse.json({ error: "A project is required to promote this follow-up." }, { status: 400 });

  try {
    const result = await promoteFollowUpToTask({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      meetingId: id,
      followUpId,
      projectId: body.projectId,
    });
    return NextResponse.json({ ok: true, taskId: result.task.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to promote this follow-up." }, { status: 403 });
    }
    if (err instanceof MfaRequiredError) {
      return NextResponse.json(
        { error: "MFA enrollment is required for this account before this action can be performed." },
        { status: 403 },
      );
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
