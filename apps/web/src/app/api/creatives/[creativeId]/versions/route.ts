import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { addCreativeVersion } from "@/lib/services/creative-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ creativeId: string }> }) {
  const { creativeId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  try {
    const version = await addCreativeVersion({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      creativeId,
      notes: body.notes,
      assetId: body.assetId,
    });
    return NextResponse.json({ ok: true, versionId: version.id, version: version.version });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to add a version to this creative." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
