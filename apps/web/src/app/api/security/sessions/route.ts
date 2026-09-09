import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { listMySessions } from "@/lib/services/auth-service";

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const sessions = await listMySessions(actor.user.id, actor.session.id);
  return NextResponse.json({ sessions });
}
