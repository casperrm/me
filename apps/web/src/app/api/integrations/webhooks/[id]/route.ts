import { NextResponse } from "next/server";
import { receiveWebhookEvent } from "@/lib/services/connection-service";
import { AuthError } from "@/lib/services/auth-service";

// This endpoint is intentionally NOT session-authenticated — it's called
// by an external system (Zapier, Make, a custom script), which has no
// Cedar Point OS session. Authenticity comes entirely from the
// X-Cedar-Signature HMAC header, verified against the connection's own
// signing secret inside receiveWebhookEvent -> GenericWebhookAdapter.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  try {
    const results = await receiveWebhookEvent({ connectionId: id, headers, rawBody });
    return NextResponse.json({ ok: true, events: results });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof Error && (err.message.includes("signature") || err.message.includes("JSON") || err.message.includes("header"))) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }
}
