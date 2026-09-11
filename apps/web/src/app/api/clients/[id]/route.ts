import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { updateClient } from "@/lib/services/client-service";
import { AuthError } from "@/lib/services/auth-service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  try {
    const client = await updateClient({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: id,
      name: body.name,
      companyName: body.companyName,
      industry: body.industry,
      lifecycleStage: body.lifecycleStage,
      primaryContactName: body.primaryContactName,
      primaryContactEmail: body.primaryContactEmail,
    });
    return NextResponse.json({ ok: true, clientId: client.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to edit this client." }, { status: 403 });
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
