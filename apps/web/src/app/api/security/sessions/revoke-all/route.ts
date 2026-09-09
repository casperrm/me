import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { revokeAllOtherSessions } from "@/lib/services/auth-service";

export async function POST() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const count = await revokeAllOtherSessions({
    userId: actor.user.id,
    membershipId: actor.membership.id,
    organizationId: actor.organizationId,
    currentSessionId: actor.session.id,
  });

  return NextResponse.json({ ok: true, revokedCount: count });
}
