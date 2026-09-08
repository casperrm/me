import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { setMfaRequiredForPrivilegedRoles } from "@/lib/services/mfa-policy-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.required !== "boolean") {
    return NextResponse.json({ error: "required must be a boolean." }, { status: 400 });
  }

  try {
    const policy = await setMfaRequiredForPrivilegedRoles({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      required: body.required,
    });
    return NextResponse.json({ ok: true, policy });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to change security policy." }, { status: 403 });
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
