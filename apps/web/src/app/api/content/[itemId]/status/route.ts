import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { setContentCalendarItemStatus, type ContentStatus } from "@/lib/services/content-calendar-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.status) return NextResponse.json({ error: "A status is required." }, { status: 400 });

  try {
    await setContentCalendarItemStatus({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      itemId,
      status: body.status as ContentStatus,
      failureReason: body.failureReason,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to update this content item." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
