import { NextResponse } from "next/server";
import { checkRateLimit } from "@cedar/auth";
import { AuthError, login } from "@/lib/services/auth-service";

// Section 23.1 abuse control: throttle brute-force/credential-stuffing
// attempts. Keyed by IP rather than email so a flood of guesses against
// many different accounts from one source is still caught, not just
// repeated guesses against one account. See docs/specs/rate-limiting.md.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit(`login:${clientIp(req)}`, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const result = await login({ email: body.email, password: body.password });
    if (result.mfaRequired) {
      return NextResponse.json({ ok: true, mfaRequired: true, pendingToken: result.pendingToken });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
}
