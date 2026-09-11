"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddNoteForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-neutral-100 pt-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a note…"
        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="rounded-md bg-cedar-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Add note"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}
