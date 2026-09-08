"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TemplateRenameForm({ templateId, currentName }: { templateId: string; currentName: string }) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/project-templates/${templateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
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
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        className="w-52 rounded border border-neutral-200 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={loading || !name.trim() || name.trim() === currentName}
        className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
      >
        {loading ? "…" : "Save"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
