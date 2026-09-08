import { NextResponse } from "next/server";
import { AuthorizationError, MfaRequiredError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { setAiBudget } from "@/lib/services/ai-budget-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = body?.monthlyTokenLimit;
  // null/absent/empty-string clears the budget (back to unrestricted) —
  // anything else must actually be a number, the service's own job to
  // validate it's a *positive* one.
  if (raw !== null && raw !== undefined && typeof raw !== "number") {
    return NextResponse.json({ error: "monthlyTokenLimit must be a number or null." }, { status: 400 });
  }
  const monthlyTokenLimit: number | null = typeof raw === "number" ? raw : null;

  try {
    await setAiBudget({ actorUserId: actor.user.id, organizationId: actor.organizationId, monthlyTokenLimit });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to manage the AI budget." }, { status: 403 });
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
