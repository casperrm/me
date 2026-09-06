import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/current-actor";
import { markAllNotificationsRead } from "@/lib/services/notification-service";

export async function POST() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  await markAllNotificationsRead(actor.membership.id);
  return NextResponse.json({ ok: true });
}
