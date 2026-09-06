import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { markNotificationAcknowledged } from "@/lib/services/notification-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    await markNotificationAcknowledged(actor.membership.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
