import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { saveVideoBrief } from "@/lib/services/video-brief-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ creativeId: string }> }) {
  const { creativeId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "A request body is required." }, { status: 400 });

  try {
    const version = await saveVideoBrief({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      creativeId,
      input: {
        concept: body.concept || undefined,
        hook: body.hook || undefined,
        storyboardNotes: body.storyboardNotes || undefined,
        script: body.script || undefined,
        voiceoverCopy: body.voiceoverCopy || undefined,
        captionCopy: body.captionCopy || undefined,
        editInstructions: body.editInstructions || undefined,
        musicNotes: body.musicNotes || undefined,
        platformVariants: Array.isArray(body.platformVariants) ? body.platformVariants : undefined,
      },
    });
    return NextResponse.json({ ok: true, version: version.version });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to edit this video brief." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
