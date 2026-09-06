import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { recordApprovalDecision, type ApprovalDecision } from "@/lib/services/creative-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.decision) return NextResponse.json({ error: "A decision is required." }, { status: 400 });

  try {
    await recordApprovalDecision({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      creativeVersionId: versionId,
      decision: body.decision as ApprovalDecision,
      comment: body.comment,
      decidedBy: body.decidedBy,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to record a decision for this creative." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
