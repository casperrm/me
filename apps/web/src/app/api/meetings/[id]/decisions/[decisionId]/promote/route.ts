import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { promoteMeetingDecisionToMemory } from "@/lib/services/agency-memory-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; decisionId: string }> }) {
  const { id, decisionId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const entry = await promoteMeetingDecisionToMemory({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      meetingId: id,
      decisionId,
    });
    return NextResponse.json({ ok: true, entryId: entry.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to promote this decision." }, { status: 403 });
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
