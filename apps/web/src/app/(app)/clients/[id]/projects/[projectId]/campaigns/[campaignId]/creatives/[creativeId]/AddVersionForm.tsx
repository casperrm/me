"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddVersionForm({ creativeId, assets }: { creativeId: string; assets: { id: string; filename: string }[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [assetId, setAssetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creatives/${creativeId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: notes || undefined, assetId: assetId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setNotes("");
      setAssetId("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="What changed in this version?"
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      {assets.length > 0 && (
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
          <option value="">No linked file</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.filename}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add version"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
