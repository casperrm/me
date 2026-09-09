import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createMeeting } from "@/lib/services/meeting-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "Meeting title is required." }, { status: 400 });

  try {
    const meeting = await createMeeting({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: body.clientId || undefined,
      title: body.title,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      attendeeMembershipIds: Array.isArray(body.attendeeMembershipIds) ? body.attendeeMembershipIds : undefined,
    });
    return NextResponse.json({ ok: true, meetingId: meeting.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to create this meeting." }, { status: 403 });
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
