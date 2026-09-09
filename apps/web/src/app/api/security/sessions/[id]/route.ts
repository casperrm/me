import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { AuthError, revokeMySession } from "@/lib/services/auth-service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    await revokeMySession({
      userId: actor.user.id,
      membershipId: actor.membership.id,
      organizationId: actor.organizationId,
      sessionId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
