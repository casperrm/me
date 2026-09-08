import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { setShootStatus, type ShootStatus } from "@/lib/services/shoot-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ shootId: string }> }) {
  const { shootId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.status) return NextResponse.json({ error: "A status is required." }, { status: 400 });

  try {
    await setShootStatus({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      shootId,
      status: body.status as ShootStatus,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to update this shoot." }, { status: 403 });
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
