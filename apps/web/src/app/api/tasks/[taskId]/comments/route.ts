import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { addTaskComment } from "@/lib/services/project-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.text) return NextResponse.json({ error: "Comment text is required." }, { status: 400 });

  try {
    const comment = await addTaskComment({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      taskId,
      text: body.text,
    });
    return NextResponse.json({ ok: true, commentId: comment.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to comment on this task." }, { status: 403 });
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
