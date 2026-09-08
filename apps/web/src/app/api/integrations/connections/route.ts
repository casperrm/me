import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createGenericWebhookConnection } from "@/lib/services/connection-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "A connection name is required." }, { status: 400 });

  try {
    const { connectionId, signingSecret } = await createGenericWebhookConnection({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      name: body.name,
    });
    // The signing secret is returned exactly once, here — the caller must
    // save it now, it is never retrievable again.
    return NextResponse.json({ ok: true, connectionId, signingSecret });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to create connections." }, { status: 403 });
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
