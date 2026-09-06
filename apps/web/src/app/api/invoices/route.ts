import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { createInvoice } from "@/lib/services/invoice-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  // amountCents must only be *present*, not truthy — a literal 0 is a
  // real (if invalid) amount and should reach createInvoice's own
  // "must be a positive number" message rather than being misreported
  // here as "missing".
  if (!body?.clientId || typeof body?.amountCents !== "number") {
    return NextResponse.json({ error: "Client and amount are required." }, { status: 400 });
  }

  try {
    const invoice = await createInvoice({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      clientId: body.clientId,
      amountCents: Number(body.amountCents),
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    });
    return NextResponse.json({ ok: true, invoiceId: invoice.id });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to create invoices." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
