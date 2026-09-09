"use client";

import { ErrorBoundaryContent } from "@/components/ErrorBoundaryContent";

// Root-level boundary. Covers two things a more specific nested
// boundary can't: routes with no boundary of their own (/login,
// /invite/[token], /setup), AND — per Next.js's error-boundary nesting
// rule, a segment's own layout.tsx sits *outside* that segment's
// error.tsx — any error thrown inside (app)/layout.tsx or
// portal/layout.tsx themselves (both do real data fetching: actor
// resolution, the MFA gate, nav permission checks), which
// (app)/error.tsx and portal/error.tsx can't catch. It does NOT catch
// an error thrown inside the true root layout (apps/web/src/app/
// layout.tsx, which only renders static shell markup with no data
// fetching or risky logic) — that would need a separate
// global-error.tsx defining its own <html>/<body>, deliberately not
// added here since the root layout has nothing in it that can throw.
// See docs/specs/error-boundaries.md.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryContent error={error} reset={reset} homeHref="/login" homeLabel="Back to Login" />;
}
