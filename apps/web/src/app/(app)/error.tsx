"use client";

import { ErrorBoundaryContent } from "@/components/ErrorBoundaryContent";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryContent error={error} reset={reset} homeHref="/dashboard" homeLabel="Go to Dashboard" />;
}
