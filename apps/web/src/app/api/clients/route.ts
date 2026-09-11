import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createClient } from "@/lib/services/client-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.companyName) {
    return NextResponse.json({ error: "Client name and company name are required." }, { status: 400 });
  }

  try {
    const client = await createClient({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
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
      return NextResponse.json({ error: "You don't have permission to create a client." }, { status: 403 });
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
