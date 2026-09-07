"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SetAiBudgetForm({ currentLimit }: { currentLimit: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(currentLimit === null ? "" : String(currentLimit));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const trimmed = value.trim();
      const res = await fetch("/api/ai-budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monthlyTokenLimit: trimmed === "" ? null : Number(trimmed) }),
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
    <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="No limit"
        className="w-36 rounded-md border border-neutral-200 px-2 py-1 text-sm"
      />
      <span className="text-xs text-neutral-400">tokens / month</span>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-cedar-600 px-3 py-1 text-xs font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
