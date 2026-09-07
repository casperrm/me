import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createProjectFromTemplate } from "@/lib/services/project-template-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.templateId) return NextResponse.json({ error: "templateId is required." }, { status: 400 });

  try {
    const project = await createProjectFromTemplate({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: id,
      templateId: body.templateId,
      name: body.name || undefined,
    });
    return NextResponse.json({ ok: true, projectId: project.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to create a project for this client." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
