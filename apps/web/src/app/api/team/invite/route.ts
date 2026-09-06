import { NextResponse } from "next/server";
import { AuthorizationError } from "@cedar/auth";
import type { Role } from "@cedar/domain";
import { getCurrentActor } from "@/lib/current-actor";
import { createInvitation } from "@/lib/services/membership-service";

export async function POST(req: Request) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.role) {
    return NextResponse.json({ error: "Email and role are required." }, { status: 400 });
  }

  try {
    const token = await createInvitation({
      actorUserId: actor.user.id,
      organizationId: actor.organizationId,
      email: body.email,
      role: body.role as Role,
    });
    // No email provider is wired up yet (Bible Section 30) — hand the
    // link back so the inviter can copy/send it manually.
    return NextResponse.json({ inviteLink: `/invite/${token}` });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "You don't have permission to invite members." }, { status: 403 });
    }
    throw err;
  }
}
