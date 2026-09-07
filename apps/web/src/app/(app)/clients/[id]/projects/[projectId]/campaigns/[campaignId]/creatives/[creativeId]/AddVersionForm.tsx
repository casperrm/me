"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssetOption, AssetPicker } from "./AssetPicker";

export function AddVersionForm({ creativeId, clientId }: { creativeId: string; clientId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [asset, setAsset] = useState<AssetOption | null>(null);
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
        body: JSON.stringify({ notes: notes || undefined, assetId: asset?.id || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setNotes("");
      setAsset(null);
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
      <AssetPicker clientId={clientId} value={asset} onChange={setAsset} />
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
