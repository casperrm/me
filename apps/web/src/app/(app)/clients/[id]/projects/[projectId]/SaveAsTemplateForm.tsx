"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SaveAsTemplateForm({ projectId, defaultName }: { projectId: string; defaultName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSuccess(`Saved as a template (${data.taskCount} task${data.taskCount === 1 ? "" : "s"}).`);
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {open ? (
        <form onSubmit={onSubmit} className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="w-40 rounded border border-neutral-200 px-2 py-1 text-xs"
          />
          <button type="submit" disabled={loading || !name.trim()} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
            {loading ? "…" : "Save"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-400 hover:underline">
            Cancel
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-cedar-700 hover:underline">
          Save as template
        </button>
      )}
      {success && <p className="mt-1 text-xs text-emerald-700">{success}</p>}
    </div>
  );
}
