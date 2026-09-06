import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createCampaign } from "@/lib/services/creative-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });

  try {
    const campaign = await createCampaign({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      projectId,
      name: body.name,
      objective: body.objective,
      platform: body.platform,
      budgetCents: body.budgetCents ? Number(body.budgetCents) : undefined,
    });
    return NextResponse.json({ ok: true, campaignId: campaign.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to create a campaign for this project." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
