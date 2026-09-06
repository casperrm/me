"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
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
        + New project
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="w-36 rounded border border-neutral-200 px-2 py-1 text-xs"
      />
      <button type="submit" disabled={loading} className="text-xs text-cedar-700 hover:underline disabled:opacity-50">
        {loading ? "…" : "Create"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
