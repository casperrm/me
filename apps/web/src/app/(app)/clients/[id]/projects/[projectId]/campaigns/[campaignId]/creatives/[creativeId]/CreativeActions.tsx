"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DECISIONS = [
  { value: "approved", label: "Approve" },
  { value: "changes_requested", label: "Request changes" },
  { value: "canceled", label: "Cancel request" },
];

export function CreativeActions({ creativeVersionId, status }: { creativeVersionId: string; status: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [decidedBy, setDecidedBy] = useState("");
  const [decision, setDecision] = useState(DECISIONS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestApproval(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creative-versions/${creativeVersionId}/request-approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: comment || undefined }),
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

  async function decide(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creative-versions/${creativeVersionId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comment: comment || undefined, decidedBy: decidedBy || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setComment("");
      setDecidedBy("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (status === "APPROVED") {
    return <p className="text-sm text-cedar-700">This version is approved. Add a new version if further changes are needed.</p>;
  }

  if (status === "PENDING_APPROVAL") {
    return (
      <form onSubmit={decide} className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Decision</label>
            <select value={decision} onChange={(e) => setDecision(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
              {DECISIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Decided by</label>
            <input
              value={decidedBy}
              onChange={(e) => setDecidedBy(e.target.value)}
              placeholder="Client contact name"
              className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment (optional)"
          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Record decision"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestApproval} className="space-y-2">
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Note for the reviewer (optional)"
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Submitting…" : "Request approval"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
