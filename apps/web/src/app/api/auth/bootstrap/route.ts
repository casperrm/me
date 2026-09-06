import { NextResponse } from "next/server";
import { AuthError, bootstrapOrganization } from "@/lib/services/auth-service";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.orgName || !body?.name || !body?.email || !body?.password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  try {
    await bootstrapOrganization(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
