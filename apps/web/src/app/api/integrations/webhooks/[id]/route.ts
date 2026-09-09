import { NextResponse } from "next/server";
import { checkRateLimit } from "@cedar/auth";
import { receiveWebhookEvent } from "@/lib/services/connection-service";
import { AuthError } from "@/lib/services/auth-service";

// Section 23.1 abuse control: this is the one endpoint in the app with no
// session auth at all, so a per-connection cap on request volume is the
// only throttle available. The threshold is generous (a legitimate
// automation platform can burst) — it's a ceiling against a runaway or
// malicious sender, not a functional rate limit. See
// docs/specs/rate-limiting.md.
const WEBHOOK_LIMIT = 120;
const WEBHOOK_WINDOW_SECONDS = 60;

// This endpoint is intentionally NOT session-authenticated — it's called
// by an external system (Zapier, Make, a custom script), which has no
// Cedar Point OS session. Authenticity comes entirely from the
// X-Cedar-Signature HMAC header, verified against the connection's own
// signing secret inside receiveWebhookEvent -> GenericWebhookAdapter.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rateLimit = await checkRateLimit(`webhook:${id}`, WEBHOOK_LIMIT, WEBHOOK_WINDOW_SECONDS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests for this connection. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

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
