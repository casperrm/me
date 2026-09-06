import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createExpense } from "@/lib/services/expense-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  // amountCents must only be *present*, not truthy — a literal 0 is a
  // real (if invalid) amount, and should reach createExpense's own
  // "must be a positive number" message rather than being misreported
  // here as "missing" (a real bug this route's contract test caught).
  if (!body?.category || typeof body?.amountCents !== "number") {
    return NextResponse.json({ error: "Category and amount are required." }, { status: 400 });
  }

  try {
    const expense = await createExpense({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      category: body.category,
      amountCents: Number(body.amountCents),
      description: body.description || undefined,
      clientId: body.clientId || undefined,
    });
    return NextResponse.json({ ok: true, expenseId: expense.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to record expenses." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
