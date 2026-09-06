import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { startMfaEnrollment } from "@/lib/services/mfa-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const result = await startMfaEnrollment(actor.user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
