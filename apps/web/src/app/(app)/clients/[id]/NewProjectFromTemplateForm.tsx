"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TemplateOption {
  id: string;
  name: string;
  taskCount: number;
  usageCount: number;
}

export function NewProjectFromTemplateForm({ clientId, templates }: { clientId: string; templates: TemplateOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (templates.length === 0) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/projects/from-template`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setTemplateId("");
      setName("");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-cedar-700 hover:underline">
        + From template
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-1">
      <select
        autoFocus
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="rounded border border-neutral-200 px-1.5 py-1 text-xs"
      >
        <option value="">Choose a template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.taskCount} task{t.taskCount === 1 ? "" : "s"}
            {t.usageCount > 0 ? `, used ${t.usageCount}x` : ""})
          </option>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name (optional)"
        className="w-40 rounded border border-neutral-200 px-2 py-1 text-xs"
      />
      <button type="submit" disabled={loading || !templateId} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
        {loading ? "…" : "Create"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-400 hover:underline">
        Cancel
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
