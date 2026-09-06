import { NextResponse } from "next/server";
import { completeMfaLogin } from "@/lib/services/mfa-service";
import { AuthError } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.pendingToken || !body?.code) {
    return NextResponse.json({ error: "A pending token and code are required." }, { status: 400 });
  }

  try {
    await completeMfaLogin(body.pendingToken, body.code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
}
