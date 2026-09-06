"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Mirrors ALLOWED_TRANSITIONS in content-calendar-service.ts — kept in
// sync manually since it's a small, stable workflow (Section 9); the
// server re-validates regardless, so a stale client-side list can only
// ever be overly permissive in the dropdown, never a security gap.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  BRIEF: ["DRAFT"],
  DRAFT: ["INTERNAL_REVIEW"],
  INTERNAL_REVIEW: ["CLIENT_APPROVAL", "SCHEDULED", "DRAFT"],
  CLIENT_APPROVAL: ["SCHEDULED", "DRAFT"],
  SCHEDULED: ["PUBLISHED", "FAILED", "DRAFT"],
  PUBLISHED: [],
  FAILED: ["SCHEDULED", "DRAFT"],
};

export function ContentItemStatusForm({ itemId, status }: { itemId: string; status: string }) {
  const router = useRouter();
  const options = ALLOWED_TRANSITIONS[status] ?? [];
  const [next, setNext] = useState(options[0] ?? "");
  const [failureReason, setFailureReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (options.length === 0) {
    return <span className="text-xs text-neutral-400">Final state</span>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${itemId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next, failureReason: next === "FAILED" ? failureReason : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-1">
      <select value={next} onChange={(e) => setNext(e.target.value)} className="rounded border border-neutral-200 px-1 py-0.5 text-xs">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {next === "FAILED" && (
        <input
          value={failureReason}
          onChange={(e) => setFailureReason(e.target.value)}
          placeholder="Reason"
          required
          className="rounded border border-neutral-200 px-1 py-0.5 text-xs"
        />
      )}
      <button type="submit" disabled={loading} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
        {loading ? "Saving…" : "Move"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
