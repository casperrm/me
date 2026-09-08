import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createContentCalendarItem } from "@/lib/services/content-calendar-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.channel) {
    return NextResponse.json({ error: "Title and channel are required." }, { status: 400 });
  }

  try {
    const item = await createContentCalendarItem({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: id,
      title: body.title,
      channel: body.channel,
      campaignId: body.campaignId || undefined,
      creativeId: body.creativeId || undefined,
      contentPillar: body.contentPillar || undefined,
      format: body.format || undefined,
      ownerId: body.ownerId || undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      publishAt: body.publishAt ? new Date(body.publishAt) : undefined,
    });
    return NextResponse.json({ ok: true, itemId: item.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to plan content for this client." }, { status: 403 });
    }
    if (err instanceof MfaRequiredError) {
      return NextResponse.json(
        { error: "MFA enrollment is required for this account before this action can be performed." },
        { status: 403 },
      );
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
