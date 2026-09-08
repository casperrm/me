import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createShoot } from "@/lib/services/shoot-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "Shoot title is required." }, { status: 400 });

  try {
    const shoot = await createShoot({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: id,
      title: body.title,
      projectId: body.projectId || undefined,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      location: body.location || undefined,
      crew: Array.isArray(body.crew) ? body.crew : undefined,
      equipment: Array.isArray(body.equipment) ? body.equipment : undefined,
      permits: Array.isArray(body.permits) ? body.permits : undefined,
      callSheetNotes: body.callSheetNotes || undefined,
      shotList: Array.isArray(body.shotList) ? body.shotList : undefined,
      productList: Array.isArray(body.productList) ? body.productList : undefined,
      references: Array.isArray(body.references) ? body.references : undefined,
    });
    return NextResponse.json({ ok: true, shootId: shoot.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to plan a shoot for this client." }, { status: 403 });
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
