"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SetMfaPolicyForm({ currentlyRequired }: { currentlyRequired: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mfa-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ required: !currentlyRequired }),
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
    <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="rounded-md bg-cedar-600 px-3 py-1 text-xs font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
      >
        {loading ? "Saving…" : currentlyRequired ? "Turn off requirement" : "Require MFA for Owner/Admin"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
