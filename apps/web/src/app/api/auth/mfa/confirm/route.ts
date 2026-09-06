import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { confirmMfaEnrollment } from "@/lib/services/mfa-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.token) return NextResponse.json({ error: "A code from your authenticator app is required." }, { status: 400 });

  try {
    const result = await confirmMfaEnrollment(actor.user.id, body.token);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
