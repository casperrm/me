"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Shared content for every route segment's error.tsx (Bible Section
 * 28.2: "meaningful empty/error states"). This app previously had no
 * error boundary anywhere — an uncaught error from a Server Component
 * render or a Server Action (e.g. AuthError/AuthorizationError/
 * MfaRequiredError propagating from a service call with no client-side
 * guard for that specific failure) crashed the *entire* page to Next's
 * generic "Application error" screen. Two separate slices this session
 * found and worked around individual instances of this at the call site
 * (disabling a dropdown option that would otherwise trigger a known
 * rejection) — see docs/specs/error-boundaries.md for why that pattern
 * remains the right *first* line of defense (predictable rejections
 * should be prevented from reaching the server at all) while this
 * component is the missing *last* line of defense for anything that
 * still gets through, known or not.
 *
 * Never renders `error.message` in production: Next.js already strips
 * server-side error messages before this component receives them
 * (replaced with a generic message, plus a `digest` correlating to the
 * real server log entry) — this component doesn't fight that, it's the
 * correct default for not leaking arbitrary internal error text to
 * whoever happens to be looking at the screen. `error.digest`, when
 * present, is shown so a user can reference it when asking for help.
 */
export function ErrorBoundaryContent({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-red-800">Something went wrong</h1>
        <p className="mt-2 text-sm text-red-700">
          This page hit an unexpected error. Nothing else you were doing elsewhere in Cedar Point OS was affected.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-red-400">Reference: {error.digest}</p>}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
          >
            Try again
          </button>
          <Link href={homeHref} className="text-sm text-red-700 hover:underline">
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
