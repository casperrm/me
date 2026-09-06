import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { disableMfa } from "@/lib/services/mfa-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.password) return NextResponse.json({ error: "Your password is required to disable MFA." }, { status: 400 });

  try {
    await disableMfa(actor.user.id, body.password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
