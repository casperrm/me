import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createCreative } from "@/lib/services/creative-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.type) return NextResponse.json({ error: "Creative type is required." }, { status: 400 });

  try {
    const creative = await createCreative({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      campaignId,
      type: body.type,
      platform: body.platform,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, creativeId: creative.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to create a creative for this campaign." }, { status: 403 });
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
