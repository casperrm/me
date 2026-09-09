"use client";

import { ErrorBoundaryContent } from "@/components/ErrorBoundaryContent";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryContent error={error} reset={reset} homeHref="/portal" homeLabel="Back to Portal" />;
}
