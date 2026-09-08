import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { searchClientAssets } from "@/lib/services/asset-service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const query = new URL(req.url).searchParams.get("q") ?? "";

  try {
    const assets = await searchClientAssets({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: id,
      query,
    });
    return NextResponse.json({ assets });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to view this client's files." }, { status: 403 });
    }
    if (err instanceof MfaRequiredError) {
      return NextResponse.json(
        { error: "MFA enrollment is required for this account before this action can be performed." },
        { status: 403 },
      );
    }
    throw err;
  }
}
