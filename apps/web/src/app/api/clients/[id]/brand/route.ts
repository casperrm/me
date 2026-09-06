import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createBrandVersion } from "@/lib/services/brand-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  try {
    const version = await createBrandVersion({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: id,
      input: {
        colors: Array.isArray(body.colors) ? body.colors : [],
        fonts: Array.isArray(body.fonts) ? body.fonts : [],
        toneOfVoice: String(body.toneOfVoice ?? ""),
        visualStyle: String(body.visualStyle ?? ""),
        targetAudience: String(body.targetAudience ?? ""),
        products: Array.isArray(body.products) ? body.products : [],
        approvedPatterns: Array.isArray(body.approvedPatterns) ? body.approvedPatterns : [],
        rejectedPatterns: Array.isArray(body.rejectedPatterns) ? body.rejectedPatterns : [],
        prohibitedLanguage: Array.isArray(body.prohibitedLanguage) ? body.prohibitedLanguage : [],
        requiredDisclaimers: Array.isArray(body.requiredDisclaimers) ? body.requiredDisclaimers : [],
      },
    });
    return NextResponse.json({ ok: true, version: version.version });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to edit this client's Brand DNA." }, { status: 403 });
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
