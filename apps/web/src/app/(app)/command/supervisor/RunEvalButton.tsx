"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunEvalButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/eval/run", { method: "POST" });
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="text-xs text-cedar-700 hover:underline disabled:opacity-50"
      >
        {loading ? "Running…" : "Run eval now"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
