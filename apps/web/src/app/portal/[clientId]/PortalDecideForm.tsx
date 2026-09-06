"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DECISIONS = [
  { value: "approved", label: "Approve" },
  { value: "changes_requested", label: "Request changes" },
];

// A Client Portal contact never types a "decided by" name — the server
// always attributes their decision to their own authenticated identity
// (see recordApprovalDecision's CLIENT_PORTAL branch), so this form only
// collects the decision itself and an optional comment.
export function PortalDecideForm({ creativeVersionId }: { creativeVersionId: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState(DECISIONS[0].value);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creative-versions/${creativeVersionId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setComment("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2 border-t border-neutral-100 pt-2">
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        >
          {DECISIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment (optional)"
          className="min-w-[12rem] flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Submit"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
