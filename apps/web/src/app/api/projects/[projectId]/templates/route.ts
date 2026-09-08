import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createProjectTemplateFromProject } from "@/lib/services/project-template-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Template name is required." }, { status: 400 });

  try {
    const template = await createProjectTemplateFromProject({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      projectId,
      name: body.name,
    });
    return NextResponse.json({ ok: true, templateId: template.id, taskCount: template.tasks.length });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to save this project as a template." }, { status: 403 });
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
