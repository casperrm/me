"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Option {
  id: string;
  label: string;
}

const CHANNELS = ["instagram", "tiktok", "facebook", "linkedin", "youtube", "email", "blog", "other"];

export function NewContentItemForm({
  clientId,
  campaigns,
  creatives,
  members,
}: {
  clientId: string;
  campaigns: Option[];
  creatives: Option[];
  members: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [contentPillar, setContentPillar] = useState("");
  const [format, setFormat] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [creativeId, setCreativeId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          channel,
          contentPillar: contentPillar || undefined,
          format: format || undefined,
          campaignId: campaignId || undefined,
          creativeId: creativeId || undefined,
          ownerId: ownerId || undefined,
          dueDate: dueDate || undefined,
          publishAt: publishAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setTitle("");
      setContentPillar("");
      setFormat("");
      setDueDate("");
      setPublishAt("");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-cedar-700 hover:underline">
        + New content item
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-md border border-neutral-100 p-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          className="min-w-[10rem] flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={contentPillar}
          onChange={(e) => setContentPillar(e.target.value)}
          placeholder="Content pillar (optional)"
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
        <input
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          placeholder="Format (optional, e.g. reel)"
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
          <option value="">No campaign</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={creativeId} onChange={(e) => setCreativeId(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
          <option value="">No linked creative</option>
          {creatives.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Publish date</label>
          <input type="date" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Add to plan"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
