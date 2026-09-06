"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CREATIVE_TYPES = ["image", "video", "carousel", "reel", "story", "copy"];

export function NewCreativeForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [type, setType] = useState(CREATIVE_TYPES[0]);
  const [platform, setPlatform] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/creatives`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, platform: platform || undefined, notes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setPlatform("");
      setNotes("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
          {CREATIVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Platform</label>
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="instagram_feed"
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-neutral-600">Notes (v1)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="First draft description"
          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
      >
        {loading ? "Adding…" : "Add creative"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
