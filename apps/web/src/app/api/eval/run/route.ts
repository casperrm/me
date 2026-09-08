import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError, requirePermission } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { runRoutingEval } from "@/lib/services/eval-service";

// Gated on ai:supervise, same as /command/supervisor — the eval run
// itself tests shared routing logic (not tenant data), but triggering
// it is still oversight-level tooling, not something every Command
// Center user needs to do.
export async function POST() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    await requirePermission({ userId: actor.user.id, organizationId: actor.organizationId, permission: "ai:supervise" });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to run evaluations." }, { status: 403 });
    }
    if (err instanceof MfaRequiredError) {
      return NextResponse.json(
        { error: "MFA enrollment is required for this account before this action can be performed." },
        { status: 403 },
      );
    }
    throw err;
  }

  const run = await runRoutingEval();
  return NextResponse.json({ ok: true, runId: run.id, totalCases: run.totalCases, passedCases: run.passedCases });
}
