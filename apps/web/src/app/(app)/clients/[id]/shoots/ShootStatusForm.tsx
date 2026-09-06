"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["PLANNED", "CONFIRMED", "COMPLETED", "CANCELED"];

export function ShootStatusForm({ shootId, status }: { shootId: string; status: string }) {
  const router = useRouter();
  const [next, setNext] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next === status) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shoots/${shootId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
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
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="submit" disabled={loading || next === status} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
        {loading ? "Saving…" : "Update"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
