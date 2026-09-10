"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Decision {
  id: string;
  text: string;
  rationale: string | null;
  createdAt: string;
  promotedToMemoryId: string | null;
}

export function MeetingDecisions({ meetingId, decisions }: { meetingId: string; decisions: Decision[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  async function onPromote(decisionId: string) {
    setPromotingId(decisionId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/decisions/${decisionId}/promote`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setPromotingId(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, rationale: rationale || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setText("");
      setRationale("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {decisions.length === 0 ? (
        <p className="text-sm text-neutral-400">No decisions recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {decisions.map((d) => (
            <li key={d.id} className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-neutral-800">{d.text}</div>
                {d.promotedToMemoryId ? (
                  <span className="shrink-0 text-xs text-cedar-700">In Agency Memory</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPromote(d.id)}
                    disabled={promotingId === d.id}
                    className="shrink-0 text-xs text-cedar-700 hover:underline disabled:opacity-50"
                  >
                    {promotingId === d.id ? "…" : "Promote to Agency Memory"}
                  </button>
                )}
              </div>
              {d.rationale && <div className="mt-0.5 text-xs text-neutral-500">Rationale: {d.rationale}</div>}
              <div className="mt-0.5 text-xs text-neutral-400">{new Date(d.createdAt).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
        <div className="flex-1 basis-full sm:basis-auto">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Decision</label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What was decided"
            className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm sm:w-56"
          />
        </div>
        <div className="flex-1 basis-full sm:basis-auto">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Rationale (optional)</label>
          <input
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why"
            className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm sm:w-56"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add decision"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
