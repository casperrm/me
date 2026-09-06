import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import { getCurrentActor } from "@/lib/current-actor";
import { markInvoicePaid } from "@/lib/services/invoice-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    await markInvoicePaid({ actorUserId: actor.user.id, organizationId: actor.organizationId, invoiceId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to update invoices." }, { status: 403 });
    }
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
