import { NextResponse } from "next/server";
import { AuthError } from "@/lib/services/auth-service";
import { acceptInvitationFlow } from "@/lib/services/membership-service";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.password) {
    return NextResponse.json({ error: "Name and password are required." }, { status: 400 });
  }

  try {
    await acceptInvitationFlow(token, { name: body.name, password: body.password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
