import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Purely a plumbing shim: Server Components (AppLayout in particular)
// have no built-in way to read the current request's pathname, only
// Client Components do (usePathname). Rather than push the MFA
// enrollment gate's server-side logic (Prisma reads, redirect()) into
// Edge middleware — which would mean a second, parallel auth code path —
// this middleware does nothing but forward the real pathname in a
// request header, and AppLayout reads it back with next/headers. No
// cookies, no database, no auth decision made here.
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
