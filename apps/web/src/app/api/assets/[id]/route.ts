import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { AssetValidationError, deleteAsset } from "@/lib/services/asset-service";
import { AuthError } from "@/lib/services/auth-service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    await deleteAsset({ actorUserId: actor.user.id, organizationId: actor.organizationId, assetId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to delete this file." }, { status: 403 });
    }
    if (err instanceof MfaRequiredError) {
      return NextResponse.json(
        { error: "MFA enrollment is required for this account before this action can be performed." },
        { status: 403 },
      );
    }
    if (err instanceof AssetValidationError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
