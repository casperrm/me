import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { flagCedarBrainRequest } from "@/lib/services/ai-supervisor-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    await flagCedarBrainRequest({ actorUserId: actor.user.id, organizationId: actor.organizationId, requestId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
