"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Option {
  id: string;
  label: string;
}

export function NewShootForm({ clientId, projects }: { clientId: string; projects: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [callSheetNotes, setCallSheetNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/shoots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          projectId: projectId || undefined,
          scheduledAt: scheduledAt || undefined,
          location: location || undefined,
          callSheetNotes: callSheetNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setTitle("");
      setLocation("");
      setCallSheetNotes("");
      setScheduledAt("");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-cedar-700 hover:underline">
        + New shoot
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-md border border-neutral-100 p-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Shoot title"
          required
          className="min-w-[10rem] flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        />
      </div>
      <textarea
        value={callSheetNotes}
        onChange={(e) => setCallSheetNotes(e.target.value)}
        placeholder="Call sheet notes (optional)"
        rows={2}
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Schedule shoot"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
